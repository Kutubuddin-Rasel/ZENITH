import { Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '../../audit/audit.constants';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { AuditService } from '../../audit/services/audit.service';
import {
  ActorContext,
  ApiKeySummary,
  ApiKeyValidationContext,
  IApiKeyAuditLogger,
  ValidatedApiKey,
} from '../interfaces/api-keys.interfaces';

const SENSITIVE_KEY_FRAGMENTS = [
  'plainkey',
  'key',
  'secret',
  'apisecret',
  'keyhash',
  'hash',
  'password',
  'token',
];

interface EmitArgs {
  readonly eventType: AuditEventType;
  readonly severity: AuditSeverity;
  readonly description: string;
  readonly organizationId: string;
  readonly resourceId?: string;
  readonly userId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly sessionId?: string;
  readonly metadata: Record<string, unknown>;
}

/**
 * SOLE consumer of `AuditService` inside the api-keys module. Every
 * audit emission for an api_key event — whether from the command
 * service, the validator, the guard, or the cleanup cron — routes
 * through this seam so the redaction policy (`sanitizeMetadata`) and
 * the envelope shape live in exactly one place.
 *
 * The legacy `ApiKeysService.logAuditEvent` + `sanitizeMetadata` pair
 * is preserved verbatim here, then exposed behind the typed
 * `IApiKeyAuditLogger` surface.
 */
@Injectable()
export class ApiKeyAuditService implements IApiKeyAuditLogger {
  private readonly logger = new Logger(ApiKeyAuditService.name);

  constructor(private readonly auditService: AuditService) {}

  async logCreated(actor: ActorContext, key: ApiKeySummary): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_CREATED,
      severity: AuditSeverity.HIGH,
      description: 'API key created',
      organizationId: this.org(actor.organizationId),
      resourceId: key.id,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      sessionId: actor.sessionId,
      metadata: {
        keyId: key.id,
        keyPrefix: key.keyPrefix,
        name: key.name,
        scopes: key.scopes,
        projectId: key.projectId,
        expiresAt: key.expiresAt,
      },
    });
  }

  async logRevoked(
    actor: ActorContext,
    key: ApiKeySummary,
    reason?: string,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_REVOKED,
      severity: AuditSeverity.HIGH,
      description: reason ? `API key revoked: ${reason}` : 'API key revoked',
      organizationId: this.org(actor.organizationId),
      resourceId: key.id,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      sessionId: actor.sessionId,
      metadata: {
        keyId: key.id,
        keyPrefix: key.keyPrefix,
        name: key.name,
        scopes: key.scopes,
        projectId: key.projectId,
        expiresAt: key.expiresAt,
        reason: reason || 'No reason provided',
      },
    });
  }

  async logUpdated(
    actor: ActorContext,
    key: ApiKeySummary,
    changes: ReadonlyArray<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_UPDATED,
      severity: AuditSeverity.MEDIUM,
      description: `API key updated: ${changes.map((c) => c.field).join(', ')}`,
      organizationId: this.org(actor.organizationId),
      resourceId: key.id,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      sessionId: actor.sessionId,
      metadata: {
        keyId: key.id,
        keyPrefix: key.keyPrefix,
        changes,
      },
    });
  }

  async logRotated(
    actor: ActorContext,
    oldKey: ApiKeySummary,
    newKey: ApiKeySummary,
    revokeAt: Date,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_ROTATED,
      severity: AuditSeverity.HIGH,
      description: `API key rotated: ${oldKey.keyPrefix}... → ${newKey.keyPrefix}...`,
      organizationId: this.org(actor.organizationId),
      resourceId: oldKey.id,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      sessionId: actor.sessionId,
      metadata: {
        oldKeyId: oldKey.id,
        oldKeyPrefix: oldKey.keyPrefix,
        newKeyId: newKey.id,
        newKeyPrefix: newKey.keyPrefix,
        revokeAt: revokeAt.toISOString(),
      },
    });
  }

  async logValidated(
    key: ValidatedApiKey,
    ctx: ApiKeyValidationContext,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_VALIDATED,
      severity: AuditSeverity.LOW,
      description: 'API key validated',
      organizationId: this.org(key.organizationId),
      resourceId: key.id,
      userId: key.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { keyPrefix: key.keyPrefix },
    });
  }

  async logValidationFailed(
    keyPrefix: string,
    reason: string,
    ctx: ApiKeyValidationContext,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_VALIDATION_FAILED,
      severity: AuditSeverity.MEDIUM,
      description: 'API key validation failed',
      organizationId: SYSTEM_TENANT_ID,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { keyPrefix, reason },
    });
  }

  async logExpired(
    key: ValidatedApiKey,
    ctx: ApiKeyValidationContext,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_EXPIRED,
      severity: AuditSeverity.MEDIUM,
      description: 'Attempted use of expired or revoked API key',
      organizationId: this.org(key.organizationId),
      resourceId: key.id,
      userId: key.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        keyPrefix: key.keyPrefix,
        expiredAt: key.expiresAt ? key.expiresAt.toISOString() : null,
      },
    });
  }

  async logIpDenied(
    key: ValidatedApiKey,
    deniedIp: string,
    ctx: ApiKeyValidationContext,
  ): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_IP_DENIED,
      severity: AuditSeverity.HIGH,
      description: `API key access blocked: IP ${deniedIp} not in allowlist`,
      organizationId: this.org(key.organizationId),
      resourceId: key.id,
      userId: key.userId,
      ipAddress: deniedIp,
      userAgent: ctx.userAgent,
      metadata: {
        keyPrefix: key.keyPrefix,
        attemptedIp: deniedIp,
        allowedIps: key.allowedIps,
        reason: 'IP not in allowlist',
      },
    });
  }

  async logRateLimitAnomaly(args: {
    readonly keyId: string;
    readonly userId: string;
    readonly organizationId: string | null;
    readonly keyPrefix: string;
    readonly rateLimit: number;
    readonly violations: number;
    readonly threshold: number;
  }): Promise<void> {
    return this.emit({
      eventType: AuditEventType.API_KEY_VALIDATION_FAILED,
      severity: AuditSeverity.HIGH,
      description: `Rate limit anomaly detected: ${args.violations} violations in 24h`,
      organizationId: this.org(args.organizationId),
      resourceId: args.keyId,
      userId: args.userId,
      metadata: {
        keyPrefix: args.keyPrefix,
        violations: args.violations,
        rateLimit: args.rateLimit,
        threshold: args.threshold,
      },
    });
  }

  async logCleanupSummary(stats: {
    readonly purgedCount: number;
    readonly notifiedCount: number;
    readonly anomalies: number;
    readonly durationMs: number;
    readonly error?: string;
  }): Promise<void> {
    const failed = !!stats.error;
    return this.emit({
      eventType: AuditEventType.CLEANUP_JOB_COMPLETED,
      severity: failed ? AuditSeverity.HIGH : AuditSeverity.LOW,
      description: failed
        ? 'Daily API key cleanup FAILED'
        : 'Daily API key cleanup completed',
      organizationId: SYSTEM_TENANT_ID,
      metadata: {
        purgedCount: stats.purgedCount,
        notifiedCount: stats.notifiedCount,
        anomaliesDetected: stats.anomalies,
        durationMs: stats.durationMs,
        ...(failed ? { error: stats.error } : {}),
      },
    });
  }

  private async emit(args: EmitArgs): Promise<void> {
    try {
      await this.auditService.log({
        organizationId: args.organizationId,
        eventType: args.eventType,
        severity: args.severity,
        description: args.description,
        userId: args.userId,
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
        sessionId: args.sessionId,
        resourceType: 'api_key',
        resourceId: args.resourceId,
        details: this.sanitizeMetadata(args.metadata),
      });
    } catch (error) {
      this.logger.error(
        `CRITICAL: Audit log failed for ${args.eventType}`,
        error,
      );
    }
  }

  private org(value: string | null | undefined): string {
    return value || SYSTEM_TENANT_ID;
  }

  private sanitizeMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEY_FRAGMENTS.some((sk) => lower.includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        sanitized[key] = this.sanitizeMetadata(
          value as Record<string, unknown>,
        );
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
