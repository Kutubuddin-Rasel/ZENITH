import { Injectable, Logger } from '@nestjs/common';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { AuditService } from '../../audit/services/audit.service';
import {
  EncryptionAuditLogger,
  EncryptionContext,
  KeyRotationProgress,
} from '../interfaces/encryption.interfaces';

/**
 * Adapter binding the `EncryptionAuditLogger` port to `AuditService`.
 * This is the ONLY service in the encryption module permitted to inject
 * the concrete `AuditService` — every other collaborator depends on the
 * abstraction.
 *
 * `AuditService.log` requires `organizationId`; when an
 * `EncryptionContext` arrives without one, we silently skip the call
 * (system-level crypto operations cannot be persisted to a
 * tenant-scoped audit table). All calls are fire-and-forget so they
 * never block the cipher path.
 */
@Injectable()
export class EncryptionAuditLoggerService extends EncryptionAuditLogger {
  private readonly logger = new Logger(EncryptionAuditLoggerService.name);

  constructor(private readonly auditService: AuditService) {
    super();
  }

  logEncryption(success: boolean, context: EncryptionContext): void {
    const orgId = context.organizationId;
    if (!orgId) return;
    this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.DATA_ENCRYPTED,
        severity: AuditSeverity.LOW,
        description: 'Data encryption operation',
        userId: context.userId,
        resourceType: context.resourceType || 'data',
        resourceId: context.resourceId,
        details: { success, ...(context.metadata ?? {}) },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to log encryption event', err),
      );
  }

  logDecryption(success: boolean, context: EncryptionContext): void {
    const orgId = context.organizationId;
    if (!orgId) return;
    this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.DATA_DECRYPTED,
        severity: AuditSeverity.LOW,
        description: 'Data decryption operation',
        userId: context.userId,
        resourceType: context.resourceType || 'data',
        resourceId: context.resourceId,
        details: { success, ...(context.metadata ?? {}) },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to log decryption event', err),
      );
  }

  logEncryptionFailure(
    operation: string,
    context: EncryptionContext | undefined,
    error: unknown,
  ): void {
    const orgId = context?.organizationId;
    if (!orgId) return;
    this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.ENCRYPTION_FAILURE,
        severity: AuditSeverity.HIGH,
        description: `Encryption operation failed: ${operation}`,
        userId: context?.userId,
        resourceType: context?.resourceType || 'data',
        resourceId: context?.resourceId,
        details: {
          operation,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to log encryption failure', err),
      );
  }

  logDecryptionFailure(
    context: EncryptionContext | undefined,
    error: unknown,
  ): void {
    const orgId = context?.organizationId;
    if (!orgId) return;
    this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.DECRYPTION_FAILURE,
        severity: AuditSeverity.HIGH,
        description: 'Decryption operation failed',
        userId: context?.userId,
        resourceType: context?.resourceType || 'data',
        resourceId: context?.resourceId,
        details: {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to log decryption failure', err),
      );
  }

  async logKeyRotationInitiated(
    oldKeyVersion: number,
    newKeyVersion: number,
    reEncryptData: boolean,
    context?: EncryptionContext,
  ): Promise<void> {
    const orgId = context?.organizationId;
    if (!orgId) return;
    await this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.KEY_ROTATION_INITIATED,
        severity: AuditSeverity.CRITICAL,
        description: `Encryption key rotation: v${oldKeyVersion} -> v${newKeyVersion}`,
        userId: context?.userId,
        resourceType: 'encryption_key',
        details: {
          oldKeyVersion,
          newKeyVersion,
          reEncryptData,
          keyRotationTimestamp: new Date().toISOString(),
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to log key rotation', err),
      );
  }

  async logKeyRotationCompleted(
    progress: KeyRotationProgress,
    context?: EncryptionContext,
  ): Promise<void> {
    const orgId = context?.organizationId;
    if (!orgId) return;
    const completedAt = progress.completedAt ?? new Date();
    await this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.KEY_ROTATION_INITIATED,
        severity: AuditSeverity.CRITICAL,
        description: 'Encryption key rotation completed',
        userId: context?.userId,
        resourceType: 'encryption_key',
        details: {
          totalRecords: progress.totalRecords,
          processedRecords: progress.processedRecords,
          failedRecords: progress.failedRecords,
          durationMs: completedAt.getTime() - progress.startedAt.getTime(),
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to log rotation completion', err),
      );
  }
}
