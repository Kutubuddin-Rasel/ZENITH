import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  API_KEY_AUDIT_TOKEN,
  API_KEY_CRYPTO_TOKEN,
  API_KEY_POLICY_TOKEN,
} from '../constants/api-keys.tokens';
import {
  API_KEY_EVENTS,
  ApiKeyCreatedEvent,
  ApiKeyRevokedEvent,
  ApiKeyRotatedEvent,
  ApiKeyUpdatedEvent,
} from '../events/api-keys-events';
import {
  ActorContext,
  ApiKeyCreateCommand,
  ApiKeyCreateResult,
  ApiKeyRotateCommand,
  ApiKeyRotateResult,
  ApiKeySummary,
  ApiKeyUpdateCommand,
  IApiKeyAuditLogger,
  IApiKeyCommand,
  IApiKeyCryptoService,
  IApiKeyPolicy,
} from '../interfaces/api-keys.interfaces';
import { AbstractApiKeyRepository } from '../repositories/abstract/api-key.repository.abstract';
import { toEventActor, toSummary } from './api-key.mapper';

const DEFAULT_ROTATION_GRACE_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Pure orchestrator for the write-side of the api-keys aggregate.
 * Owns every mutation (create / revoke / update / rotate) and delegates
 * crypto, policy enforcement, persistence, audit, and event emission
 * to segregated collaborators.
 *
 * Rotation atomicity
 * ------------------
 * `rotate` uses `AbstractApiKeyRepository.rotateInTransaction` to
 * close the read-modify-write race in the legacy two-`save()` flow.
 * The new key insert and the old key's `revokeAt`/`rotatedToKeyId`
 * update commit (or roll back) together — a process death between
 * them can never leave the new key live AND the old key un-revoked.
 */
@Injectable()
export class ApiKeyCommandService implements IApiKeyCommand {
  private readonly logger = new Logger(ApiKeyCommandService.name);

  constructor(
    private readonly repo: AbstractApiKeyRepository,
    @Inject(API_KEY_CRYPTO_TOKEN)
    private readonly crypto: IApiKeyCryptoService,
    @Inject(API_KEY_POLICY_TOKEN)
    private readonly policy: IApiKeyPolicy,
    @Inject(API_KEY_AUDIT_TOKEN)
    private readonly audit: IApiKeyAuditLogger,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    actor: ActorContext,
    command: ApiKeyCreateCommand,
  ): Promise<ApiKeyCreateResult> {
    const { plainKey, keyPrefix } = this.crypto.generateRawKey();
    const keyHash = await this.crypto.hash(plainKey);

    const entity = this.repo.createEntity({
      name: command.name,
      keyHash,
      keyPrefix,
      userId: actor.userId,
      projectId: command.projectId,
      scopes: [...command.scopes],
      expiresAt: command.expiresAt ? new Date(command.expiresAt) : undefined,
      ...(typeof command.rateLimit === 'number'
        ? { rateLimit: command.rateLimit }
        : {}),
      allowedIps: command.allowedIps ? [...command.allowedIps] : null,
      isActive: true,
    });

    const saved = await this.repo.save(entity);
    const summary = toSummary(saved);

    await this.audit.logCreated(actor, summary);
    const event: ApiKeyCreatedEvent = {
      key: summary,
      actor: toEventActor(actor),
      timestamp: new Date(),
    };
    this.eventEmitter.emit(API_KEY_EVENTS.CREATED, event);

    this.logger.log(
      `API key created: ${summary.keyPrefix}... by user ${actor.userId}`,
    );
    return { plainKey, apiKey: summary };
  }

  async revoke(
    actor: ActorContext,
    id: string,
    reason?: string,
  ): Promise<void> {
    const entity = await this.repo.findOneByIdForUser(id, actor.userId);
    if (!entity) {
      throw new NotFoundException('API key not found');
    }

    const summary = toSummary(entity);
    this.policy.assertOwnedBy(summary, actor.userId);

    await this.repo.remove(entity);

    await this.audit.logRevoked(actor, summary, reason);
    const event: ApiKeyRevokedEvent = {
      key: summary,
      actor: toEventActor(actor),
      timestamp: new Date(),
      reason: reason ?? null,
    };
    this.eventEmitter.emit(API_KEY_EVENTS.REVOKED, event);

    this.logger.log(
      `API key revoked: ${summary.keyPrefix}... by ${actor.userId}`,
    );
  }

  async update(
    actor: ActorContext,
    id: string,
    updates: ApiKeyUpdateCommand,
  ): Promise<ApiKeySummary> {
    const entity = await this.repo.findOneByIdForUser(id, actor.userId);
    if (!entity) {
      throw new NotFoundException('API key not found');
    }
    this.policy.assertOwnedBy(toSummary(entity), actor.userId);

    const changes: Array<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    if (updates.name && updates.name !== entity.name) {
      changes.push({
        field: 'name',
        oldValue: entity.name,
        newValue: updates.name,
      });
      entity.name = updates.name;
    }

    if (
      updates.scopes &&
      JSON.stringify(updates.scopes) !== JSON.stringify(entity.scopes)
    ) {
      const nextScopes = [...updates.scopes];
      changes.push({
        field: 'scopes',
        oldValue: entity.scopes,
        newValue: nextScopes,
      });
      entity.scopes = nextScopes;
    }

    if (changes.length === 0) {
      return toSummary(entity);
    }

    const saved = await this.repo.save(entity);
    const summary = toSummary(saved);

    await this.audit.logUpdated(actor, summary, changes);
    const event: ApiKeyUpdatedEvent = {
      key: summary,
      actor: toEventActor(actor),
      timestamp: new Date(),
      changes,
    };
    this.eventEmitter.emit(API_KEY_EVENTS.UPDATED, event);

    this.logger.log(
      `API key updated: ${summary.keyPrefix}... by ${actor.userId}`,
    );
    return summary;
  }

  async rotate(
    actor: ActorContext,
    command: ApiKeyRotateCommand,
  ): Promise<ApiKeyRotateResult> {
    const gracePeriod =
      command.gracePeriodHours ?? DEFAULT_ROTATION_GRACE_HOURS;

    const oldEntity = await this.repo.findOneActiveByIdForUser(
      command.id,
      actor.userId,
    );
    if (!oldEntity) {
      throw new NotFoundException('API key not found or not active');
    }

    const oldSummary = toSummary(oldEntity);
    this.policy.assertOwnedBy(oldSummary, actor.userId);
    this.policy.assertNotRotated(oldSummary);

    const { plainKey, keyPrefix } = this.crypto.generateRawKey();
    const keyHash = await this.crypto.hash(plainKey);
    const revokeAt = new Date(Date.now() + gracePeriod * MS_PER_HOUR);

    const newEntity = this.repo.createEntity({
      name: oldEntity.name,
      scopes: [...oldEntity.scopes],
      projectId: oldEntity.projectId,
      rateLimit: oldEntity.rateLimit,
      allowedIps: oldEntity.allowedIps ? [...oldEntity.allowedIps] : null,
      userId: oldEntity.userId,
      expiresAt: oldEntity.expiresAt,
      keyHash,
      keyPrefix,
      isActive: true,
    });

    const { oldKey, newKey } = await this.repo.rotateInTransaction(
      oldEntity.id,
      newEntity,
      revokeAt,
    );
    const newSummary = toSummary(newKey);
    const finalOldSummary = toSummary(oldKey);

    await this.audit.logRotated(actor, finalOldSummary, newSummary, revokeAt);
    const event: ApiKeyRotatedEvent = {
      oldKey: finalOldSummary,
      newKey: newSummary,
      revokeAt,
      actor: toEventActor(actor),
      timestamp: new Date(),
    };
    this.eventEmitter.emit(API_KEY_EVENTS.ROTATED, event);

    this.logger.log(
      `API key rotated: ${finalOldSummary.keyPrefix}... → ${newSummary.keyPrefix}... by ${actor.userId}`,
    );

    return {
      plainKey,
      newKey: newSummary,
      oldKeyRevocation: {
        id: finalOldSummary.id,
        revokedAt: revokeAt,
      },
    };
  }
}
