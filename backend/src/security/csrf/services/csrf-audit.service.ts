import { Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '../../../audit/audit.constants';
import {
  AuditEventType,
  AuditSeverity,
} from '../../../audit/entities/audit-log.entity';
import { AuditService } from '../../../audit/services/audit.service';
import {
  CsrfFailureContext,
  ICsrfAuditor,
} from '../interfaces/csrf.interfaces';

/**
 * Adapter port wrapping `AuditService` for CSRF security events.
 *
 * SYSTEM-SCOPED: every event is written with `organizationId:
 * SYSTEM_TENANT_ID` because CSRF failures occur before authentication
 * is resolved (or by attackers who never authenticate). They are a
 * system-level forensic signal, NOT a tenant-scoped event — so they
 * must never appear in tenant-bounded audit queries.
 *
 * This is the ONLY service in the CSRF module permitted to inject the
 * concrete `AuditService`. Every other service depends on this port
 * (`ICsrfAuditor`).
 */
@Injectable()
export class CsrfAuditService extends ICsrfAuditor {
  private readonly logger = new Logger(CsrfAuditService.name);

  constructor(private readonly auditService: AuditService) {
    super();
  }

  async logFailure(context: CsrfFailureContext): Promise<void> {
    try {
      await this.auditService.log({
        organizationId: SYSTEM_TENANT_ID,
        eventType: AuditEventType.CSRF_VALIDATION_FAILED,
        severity: AuditSeverity.HIGH,
        description: `Stateful CSRF validation failed: ${context.reason}`,
        userId: context.userId || undefined,
        ipAddress: context.clientIp,
        userAgent: context.userAgent,
        resourceType: 'csrf',
        details: {
          failureReason: context.reason,
          guardType: 'stateful',
          path: context.path,
          method: context.method,
          isAuthenticated: context.isAuthenticated,
          hasHeaderToken: context.hasHeaderToken,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log CSRF_VALIDATION_FAILED event', error);
    }

    this.logger.warn(
      `CSRF BLOCKED (Stateful): ${context.reason} | ${context.method} ${context.path} | IP: ${context.clientIp} | User: ${context.userId || 'anonymous'}`,
    );
  }

  async logBanTriggered(clientIp: string, failureCount: number): Promise<void> {
    try {
      await this.auditService.log({
        organizationId: SYSTEM_TENANT_ID,
        eventType: AuditEventType.CSRF_VALIDATION_FAILED,
        severity: AuditSeverity.HIGH,
        description: `CSRF rate limit ban triggered after ${failureCount} failures`,
        ipAddress: clientIp,
        resourceType: 'csrf',
        details: {
          failureReason: 'rate_limit_ban_triggered',
          failureCount,
          guardType: 'stateful',
        },
      });
    } catch (error) {
      this.logger.error('Failed to log CSRF ban trigger event', error);
    }
  }
}
