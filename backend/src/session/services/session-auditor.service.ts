import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { SYSTEM_TENANT_ID } from '../../audit/audit.constants';
import {
  ISessionAuditor,
  SessionCreatedAudit,
  SessionLockedAudit,
  SessionTerminatedAudit,
  SuspiciousActivityAudit,
} from '../interfaces/session.interfaces';

/**
 * {@link ISessionAuditor} adapter — wraps `AuditService` behind intent-named
 * methods, keeping the audit concretion (event types, severities,
 * SYSTEM_TENANT_ID) out of the application services. Payloads preserved
 * verbatim from the legacy SessionService.
 */
@Injectable()
export class SessionAuditorService extends ISessionAuditor {
  constructor(private readonly auditService: AuditService) {
    super();
  }

  async sessionCreated(event: SessionCreatedAudit): Promise<void> {
    await this.auditService.log({
      organizationId: event.organizationId || SYSTEM_TENANT_ID,
      eventType: AuditEventType.SESSION_CREATED,
      severity: AuditSeverity.LOW,
      description: 'User session created',
      userId: event.userId,
      resourceType: 'session',
      resourceId: event.sessionId,
      details: {
        sessionType: event.sessionType,
        isRememberMe: event.isRememberMe,
        deviceInfo: event.deviceInfo,
        ipAddress: event.ipAddress,
      },
    });
  }

  async sessionTerminated(event: SessionTerminatedAudit): Promise<void> {
    await this.auditService.log({
      organizationId: SYSTEM_TENANT_ID,
      eventType: AuditEventType.SESSION_TERMINATED,
      severity: AuditSeverity.MEDIUM,
      description: 'User session terminated',
      userId: event.userId,
      resourceType: 'session',
      resourceId: event.sessionId,
      details: {
        terminatedBy: event.terminatedBy,
        reason: event.reason,
        sessionDuration: event.sessionDurationMs,
      },
    });
  }

  async suspiciousActivity(event: SuspiciousActivityAudit): Promise<void> {
    await this.auditService.log({
      organizationId: SYSTEM_TENANT_ID,
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      severity: AuditSeverity.HIGH,
      description: 'Suspicious session activity detected',
      userId: event.userId,
      resourceType: 'session',
      resourceId: event.sessionId,
      details: {
        indicators: event.indicators,
        sessionData: {
          requestCount: event.requestCount,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
        },
      },
    });
  }

  async sessionLocked(event: SessionLockedAudit): Promise<void> {
    await this.auditService.log({
      organizationId: SYSTEM_TENANT_ID,
      eventType: AuditEventType.SESSION_LOCKED,
      severity: AuditSeverity.HIGH,
      description: 'Session locked due to suspicious activity',
      userId: event.userId,
      resourceType: 'session',
      resourceId: event.sessionId,
      details: { lockedBy: event.lockedBy, reason: event.reason },
    });
  }
}
