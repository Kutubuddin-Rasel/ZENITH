import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  API_KEY_AUDIT_TOKEN,
  API_KEY_CRYPTO_TOKEN,
} from '../constants/api-keys.tokens';
import {
  API_KEY_EVENTS,
  ApiKeyExpiredEvent,
  ApiKeyValidationFailedEvent,
} from '../events/api-keys-events';
import {
  ApiKeyValidationContext,
  IApiKeyAuditLogger,
  IApiKeyCryptoService,
  IApiKeyValidator,
  ValidatedApiKey,
} from '../interfaces/api-keys.interfaces';
import { AbstractApiKeyRepository } from '../repositories/abstract/api-key.repository.abstract';
import { toValidatedApiKey } from './api-key.mapper';

const API_KEY_PREFIX_GUARD = 'zth_live_';
const KEY_PREFIX_LENGTH = 12;

/**
 * Hot-path bearer-credential validator. Owns the prefix-match +
 * bcrypt-compare + expiration + grace-window pipeline and emits the
 * `API_KEY_EXPIRED` / `API_KEY_VALIDATION_FAILED` audit + event
 * signals on failure. Returns the sanitized `ValidatedApiKey`
 * projection on success — NEVER the raw entity, so `keyHash` and
 * the joined `User` cannot leak across the module barrier.
 *
 * IP-allowlist and rate-limit enforcement remain in `ApiKeyGuard`;
 * the validator only proves the bearer credential is real.
 *
 * Best-effort `lastUsedAt` write-back: failures here MUST NOT reject
 * the request (matches legacy behaviour) — a stuck DB connection
 * must never deny a legitimate request.
 */
@Injectable()
export class ApiKeyValidatorService implements IApiKeyValidator {
  private readonly logger = new Logger(ApiKeyValidatorService.name);

  constructor(
    private readonly repo: AbstractApiKeyRepository,
    @Inject(API_KEY_CRYPTO_TOKEN)
    private readonly crypto: IApiKeyCryptoService,
    @Inject(API_KEY_AUDIT_TOKEN)
    private readonly audit: IApiKeyAuditLogger,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async validate(
    plainKey: string,
    ctx: ApiKeyValidationContext = {},
  ): Promise<ValidatedApiKey | null> {
    if (!plainKey || !plainKey.startsWith(API_KEY_PREFIX_GUARD)) {
      return null;
    }

    const keyPrefix = plainKey.substring(0, KEY_PREFIX_LENGTH);
    const candidates = await this.repo.findByKeyPrefixActive(keyPrefix);

    for (const entity of candidates) {
      const match = await this.crypto.compare(plainKey, entity.keyHash);
      if (!match) continue;

      const dto = toValidatedApiKey(entity);

      if (entity.expiresAt && new Date() > entity.expiresAt) {
        this.emitExpired(dto, ctx);
        return null;
      }

      if (entity.revokeAt && new Date() > entity.revokeAt) {
        this.emitExpired(dto, ctx);
        return null;
      }

      this.repo
        .updateLastUsed(entity.id, new Date())
        .catch((err) =>
          this.logger.debug(`lastUsedAt write-back failed: ${err}`),
        );

      return dto;
    }

    this.emitValidationFailed(keyPrefix, 'No matching key found', ctx);
    return null;
  }

  private emitExpired(
    dto: ValidatedApiKey,
    ctx: ApiKeyValidationContext,
  ): void {
    this.audit
      .logExpired(dto, ctx)
      .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
    const event: ApiKeyExpiredEvent = {
      key: dto,
      context: ctx,
      timestamp: new Date(),
    };
    this.eventEmitter.emit(API_KEY_EVENTS.EXPIRED, event);
  }

  private emitValidationFailed(
    keyPrefix: string,
    reason: string,
    ctx: ApiKeyValidationContext,
  ): void {
    this.audit
      .logValidationFailed(keyPrefix, reason, ctx)
      .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
    const event: ApiKeyValidationFailedEvent = {
      keyPrefix,
      reason,
      context: ctx,
      timestamp: new Date(),
    };
    this.eventEmitter.emit(API_KEY_EVENTS.VALIDATION_FAILED, event);
  }
}
