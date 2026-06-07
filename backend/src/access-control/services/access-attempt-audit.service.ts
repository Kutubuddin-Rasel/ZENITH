import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { SYSTEM_TENANT_ID } from '../../audit/audit.constants';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import {
  AccessAttempt,
  IAccessAttemptAuditor,
  IAccessRuleAuditor,
  RuleAuditEvent,
} from '../interfaces/access-control.interfaces';

/**
 * Sole place that depends on the concrete AuditService (mirrors
 * encryption-audit-logger.service.ts). Implements both auditor ports:
 * access-attempt logging (hot path) and rule-lifecycle logging (writes).
 */
@Injectable()
export class AccessAttemptAuditService
  implements IAccessAttemptAuditor, IAccessRuleAuditor
{
  private readonly logger = new Logger(AccessAttemptAuditService.name);

  constructor(private readonly auditService: AuditService) {}

  async record(attempt: AccessAttempt): Promise<void> {
    try {
      await this.auditService.log({
        organizationId: attempt.organizationId || SYSTEM_TENANT_ID,
        eventType: attempt.allowed
          ? AuditEventType.ACCESS_GRANTED
          : AuditEventType.ACCESS_DENIED,
        severity: attempt.allowed ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
        description: attempt.allowed ? 'Access granted' : 'Access denied',
        userId: attempt.userId,
        resourceType: 'access_control',
        resourceId: attempt.ruleId,
        ipAddress: attempt.ipAddress,
        userAgent: attempt.userAgent,
        details: {
          reason: attempt.reason,
          location: attempt.location,
          timestamp: attempt.timestamp,
          organizationId: attempt.organizationId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log access attempt', error);
    }
  }

  async recordRuleChange(event: RuleAuditEvent): Promise<void> {
    const { rule, actorId } = event;
    const orgId = rule.organizationId || SYSTEM_TENANT_ID;

    if (event.action === 'created') {
      await this.auditService
        .log({
          organizationId: orgId,
          eventType: AuditEventType.ACCESS_RULE_CREATED,
          severity: AuditSeverity.MEDIUM,
          description: `IP access rule created${rule.organizationId ? ` for org ${rule.organizationId}` : ' (global)'}`,
          userId: actorId || undefined,
          resourceType: 'access_rule',
          resourceId: rule.id,
          details: {
            ruleType: rule.ruleType,
            ipAddress: rule.ipAddress,
            name: rule.name,
            organizationId: rule.organizationId,
            isGlobal: rule.organizationId === null,
          },
        })
        .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
      return;
    }

    if (event.action === 'updated') {
      await this.auditService
        .log({
          organizationId: orgId,
          eventType: AuditEventType.ACCESS_RULE_UPDATED,
          severity: AuditSeverity.MEDIUM,
          description: 'IP access rule updated',
          userId: actorId || undefined,
          resourceType: 'access_rule',
          resourceId: rule.id,
          details: {
            changes: event.changes,
            changedFields: event.changedFields,
            organizationId: rule.organizationId,
          },
        })
        .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
      return;
    }

    await this.auditService
      .log({
        organizationId: orgId,
        eventType: AuditEventType.ACCESS_RULE_DELETED,
        severity: AuditSeverity.MEDIUM,
        description: 'IP access rule deleted',
        userId: actorId || undefined,
        resourceType: 'access_rule',
        resourceId: rule.id,
        details: {
          ruleName: rule.name,
          ruleType: rule.ruleType,
          organizationId: rule.organizationId,
        },
      })
      .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
  }
}
