import { SYSTEM_TENANT_ID } from '../../audit/audit.constants';
import { ApiKey } from '../entities/api-key.entity';
import { ApiKeyEventActor } from '../events/api-keys-events';
import {
  ActorContext,
  ApiKeySummary,
  ValidatedApiKey,
} from '../interfaces/api-keys.interfaces';

/**
 * Entity → DTO projection helpers.
 *
 * Centralised so the command, query, and validator services all
 * produce identical wire shapes. `keyHash` is NEVER copied through —
 * the type system (the absent property on the DTOs) catches accidental
 * leakage at compile time.
 */

export function toSummary(entity: ApiKey): ApiKeySummary {
  return {
    id: entity.id,
    name: entity.name,
    keyPrefix: entity.keyPrefix,
    userId: entity.userId,
    projectId: entity.projectId ?? null,
    scopes: entity.scopes ?? [],
    lastUsedAt: entity.lastUsedAt ?? null,
    expiresAt: entity.expiresAt ?? null,
    rateLimit: entity.rateLimit,
    allowedIps: entity.allowedIps ?? null,
    revokeAt: entity.revokeAt ?? null,
    rotatedToKeyId: entity.rotatedToKeyId ?? null,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toValidatedApiKey(entity: ApiKey): ValidatedApiKey {
  const organizationId =
    (entity.user as { organizationId?: string } | undefined)?.organizationId ??
    null;
  return {
    id: entity.id,
    userId: entity.userId,
    organizationId,
    projectId: entity.projectId ?? null,
    keyPrefix: entity.keyPrefix,
    scopes: entity.scopes ?? [],
    rateLimit: entity.rateLimit,
    allowedIps: entity.allowedIps ?? null,
    expiresAt: entity.expiresAt ?? null,
  };
}

export function toEventActor(actor: ActorContext): ApiKeyEventActor {
  return {
    userId: actor.userId,
    organizationId: actor.organizationId ?? null,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
  };
}

export function resolveOrganizationId(
  actor: ActorContext | { organizationId: string | null },
): string {
  return actor.organizationId ?? SYSTEM_TENANT_ID;
}
