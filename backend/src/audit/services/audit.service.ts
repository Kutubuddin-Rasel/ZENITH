import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, SelectQueryBuilder } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Readable } from 'stream';
import {
  AuditLog,
  AuditEventType,
  AuditSeverity,
  AuditStatus,
} from '../entities/audit-log.entity';
import { User } from '../../users/entities/user.entity';
import {
  SECURITY_ALERTS_QUEUE,
  SECURITY_ALERT_JOB_OPTIONS,
  ALERT_SEVERITY_THRESHOLD,
  sanitizeForAlert,
  SecurityAlertJobPayload,
} from '../security-alerts/security-alerts.constants';

export interface AuditLogData {
  organizationId: string;
  eventType: AuditEventType;
  severity?: AuditSeverity;
  status?: AuditStatus;
  description: string;
  details?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  userName?: string;
  resourceType?: string;
  resourceId?: string;
  projectId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  country?: string;
  city?: string;
  region?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export interface AuditLogFilter {
  organizationId: string;
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  statuses?: AuditStatus[];
  userIds?: string[];
  projectIds?: string[];
  resourceTypes?: string[];
  resourceIds?: string[];
  ipAddresses?: string[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'severity' | 'eventType';
  orderDirection?: 'ASC' | 'DESC';
}

export interface AuditLogStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByStatus: Record<string, number>;
  eventsByUser: Record<string, number>;
  eventsByProject: Record<string, number>;
  eventsByDay: Record<string, number>;
  topUsers: Array<{ userId: string; userName: string; count: number }>;
  topProjects: Array<{ projectId: string; count: number }>;
  securityEvents: number;
  failedLogins: number;
  suspiciousActivity: number;
}

// ---------------------------------------------------------------------------
// Strict Result Interfaces for PostgreSQL Aggregation
// ---------------------------------------------------------------------------

/** Row returned by GROUP BY + COUNT(*) queries */
interface AggregatedCountRow {
  key: string;
  count: string; // PostgreSQL COUNT returns string
}

/** Row for top-users aggregation (includes userName) */
interface AggregatedUserRow {
  userId: string;
  userName: string;
  count: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectQueue(SECURITY_ALERTS_QUEUE)
    private readonly securityAlertsQueue: Queue<SecurityAlertJobPayload>,
  ) {}

  /**
   * Log an audit event
   */
  async log(data: AuditLogData): Promise<AuditLog> {
    const auditLog = new AuditLog();
    auditLog.organizationId = data.organizationId;
    auditLog.eventType = data.eventType;
    auditLog.severity = data.severity || AuditSeverity.LOW;
    auditLog.status = data.status || AuditStatus.INFO;
    auditLog.description = data.description;
    auditLog.details = data.details ? JSON.stringify(data.details) : null;
    auditLog.oldValues = data.oldValues ? JSON.stringify(data.oldValues) : null;
    auditLog.newValues = data.newValues ? JSON.stringify(data.newValues) : null;
    auditLog.userId = data.userId || null;
    auditLog.userEmail = data.userEmail || null;
    auditLog.userName = data.userName || null;
    auditLog.resourceType = data.resourceType || null;
    auditLog.resourceId = data.resourceId || null;
    auditLog.projectId = data.projectId || null;
    auditLog.ipAddress = data.ipAddress || null;
    auditLog.userAgent = data.userAgent || null;
    auditLog.sessionId = data.sessionId || null;
    auditLog.requestId = data.requestId || null;
    auditLog.country = data.country || null;
    auditLog.city = data.city || null;
    auditLog.region = data.region || null;
    auditLog.metadata = data.metadata || null;
    auditLog.correlationId = data.correlationId || null;
    auditLog.expiresAt = this.calculateExpirationDate(data.eventType);
    auditLog.isRetained = this.isRetentionRequired(data.eventType);
    auditLog.isEncrypted = this.isEncryptionRequired(data.eventType);

    const savedLog = await this.auditLogRepo.save(auditLog);

    // Fire-and-forget: dispatch security alert for HIGH/CRITICAL events
    // This MUST NOT block or fail the primary audit INSERT
    const effectiveSeverity = data.severity || AuditSeverity.LOW;
    if (ALERT_SEVERITY_THRESHOLD.includes(effectiveSeverity)) {
      const alertPayload = sanitizeForAlert(
        savedLog.id,
        data.organizationId,
        data.eventType,
        effectiveSeverity,
        data.description,
        data.userId || null,
        data.ipAddress || null,
      );

      this.securityAlertsQueue
        .add('security-alert', alertPayload, SECURITY_ALERT_JOB_OPTIONS)
        .catch((err: Error) => {
          this.logger.warn(
            `Failed to enqueue security alert for audit=${savedLog.id}: ${err.message}`,
          );
        });
    }

    return savedLog;
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    organizationId: string,
    eventType: AuditEventType,
    userId: string,
    userEmail: string,
    userName: string,
    ipAddress: string,
    userAgent: string,
    sessionId: string,
    details?: Record<string, unknown>,
    status: AuditStatus = AuditStatus.SUCCESS,
  ): Promise<AuditLog> {
    return this.log({
      organizationId,
      eventType,
      severity: this.getSeverityForAuthEvent(eventType),
      status,
      description: this.getDescriptionForAuthEvent(eventType, userEmail),
      details,
      userId,
      userEmail,
      userName,
      ipAddress,
      userAgent,
      sessionId,
      resourceType: 'user',
      resourceId: userId,
    });
  }

  /**
   * Log resource modification events
   */
  async logResourceEvent(
    organizationId: string,
    eventType: AuditEventType,
    resourceType: string,
    resourceId: string,
    userId: string,
    userEmail: string,
    userName: string,
    projectId?: string,
    oldValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>,
    details?: Record<string, unknown>,
  ): Promise<AuditLog> {
    return this.log({
      organizationId,
      eventType,
      severity: this.getSeverityForResourceEvent(eventType),
      status: AuditStatus.SUCCESS,
      description: this.getDescriptionForResourceEvent(
        eventType,
        resourceType,
        resourceId,
      ),
      details,
      oldValues,
      newValues,
      userId,
      userEmail,
      userName,
      resourceType,
      resourceId,
      projectId,
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    organizationId: string,
    eventType: AuditEventType,
    description: string,
    userId?: string,
    userEmail?: string,
    userName?: string,
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, unknown>,
    severity: AuditSeverity = AuditSeverity.HIGH,
  ): Promise<AuditLog> {
    return this.log({
      organizationId,
      eventType,
      severity,
      status: AuditStatus.WARNING,
      description,
      details,
      userId,
      userEmail,
      userName,
      ipAddress,
      userAgent,
      resourceType: 'security',
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(
    filter: AuditLogFilter,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = this.auditLogRepo.createQueryBuilder('audit');

    // MANDATORY: Database-level tenant isolation
    this.applyTenantFilter(query, filter.organizationId);

    // Apply filters
    if (filter.eventTypes?.length) {
      query.andWhere('audit.eventType IN (:...eventTypes)', {
        eventTypes: filter.eventTypes,
      });
    }

    if (filter.severities?.length) {
      query.andWhere('audit.severity IN (:...severities)', {
        severities: filter.severities,
      });
    }

    if (filter.statuses?.length) {
      query.andWhere('audit.status IN (:...statuses)', {
        statuses: filter.statuses,
      });
    }

    if (filter.userIds?.length) {
      query.andWhere('audit.userId IN (:...userIds)', {
        userIds: filter.userIds,
      });
    }

    if (filter.projectIds?.length) {
      query.andWhere('audit.projectId IN (:...projectIds)', {
        projectIds: filter.projectIds,
      });
    }

    if (filter.resourceTypes?.length) {
      query.andWhere('audit.resourceType IN (:...resourceTypes)', {
        resourceTypes: filter.resourceTypes,
      });
    }

    if (filter.resourceIds?.length) {
      query.andWhere('audit.resourceId IN (:...resourceIds)', {
        resourceIds: filter.resourceIds,
      });
    }

    if (filter.ipAddresses?.length) {
      query.andWhere('audit.ipAddress IN (:...ipAddresses)', {
        ipAddresses: filter.ipAddresses,
      });
    }

    if (filter.startDate) {
      query.andWhere('audit.timestamp >= :startDate', {
        startDate: filter.startDate,
      });
    }

    if (filter.endDate) {
      query.andWhere('audit.timestamp <= :endDate', {
        endDate: filter.endDate,
      });
    }

    if (filter.search) {
      query.andWhere(
        '(audit.description ILIKE :search OR audit.userEmail ILIKE :search OR audit.userName ILIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    // Apply ordering
    const orderBy = filter.orderBy || 'timestamp';
    const orderDirection = filter.orderDirection || 'DESC';
    query.orderBy(`audit.${orderBy}`, orderDirection);

    // Apply pagination
    if (filter.limit) {
      query.limit(filter.limit);
    }
    if (filter.offset) {
      query.offset(filter.offset);
    }

    const [logs, total] = await query.getManyAndCount();

    return { logs, total };
  }

  /**
   * Stream audit logs as a ReadableStream for memory-safe export.
   *
   * Returns a raw TypeORM ReadStream (Node.js Readable in objectMode).
   * Each emitted object is a raw DB row with alias-prefixed columns
   * (e.g., `audit_id`, `audit_eventType`).
   *
   * TENANT ISOLATION: `applyTenantFilter()` is called before `.stream()`.
   * BACKPRESSURE: Handled by pipeline() in the controller.
   * CLEANUP: The caller MUST destroy() the stream on client disconnect.
   */
  async exportAuditLogsStream(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Readable> {
    const query = this.auditLogRepo.createQueryBuilder('audit');

    // MANDATORY: Database-level tenant isolation
    this.applyTenantFilter(query, organizationId);

    if (startDate) {
      query.andWhere('audit.timestamp >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('audit.timestamp <= :endDate', { endDate });
    }

    query.orderBy('audit.timestamp', 'DESC');

    return query.stream();
  }

  /**
   * Get audit log statistics
   */
  async getAuditStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
    projectId?: string,
  ): Promise<AuditLogStats> {
    // MANDATORY: Database-level tenant isolation
    // Build a base query factory that always includes the tenant filter.
    // Each aggregation query gets its own QueryBuilder instance.
    const baseQuery = (): SelectQueryBuilder<AuditLog> => {
      const qb = this.auditLogRepo.createQueryBuilder('audit');
      this.applyTenantFilter(qb, organizationId);
      if (startDate) {
        qb.andWhere('audit.timestamp >= :startDate', { startDate });
      }
      if (endDate) {
        qb.andWhere('audit.timestamp <= :endDate', { endDate });
      }
      if (projectId) {
        qb.andWhere('audit.projectId = :projectId', { projectId });
      }
      return qb;
    };

    // AGGREGATION PUSHDOWN: All counting done in PostgreSQL, not JS.
    // Memory: O(enum_cardinality) not O(total_logs).

    // 1. Total events — single COUNT(*)
    const totalEvents = await baseQuery().getCount();

    // 2. Events by type — GROUP BY eventType
    const eventsByTypeRows: AggregatedCountRow[] = await baseQuery()
      .select('audit.eventType', 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.eventType')
      .getRawMany();

    // 3. Events by severity — GROUP BY severity
    const eventsBySeverityRows: AggregatedCountRow[] = await baseQuery()
      .select('audit.severity', 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.severity')
      .getRawMany();

    // 4. Events by status — GROUP BY status
    const eventsByStatusRows: AggregatedCountRow[] = await baseQuery()
      .select('audit.status', 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.status')
      .getRawMany();

    // 5. Events by day — GROUP BY DATE(timestamp)
    const eventsByDayRows: AggregatedCountRow[] = await baseQuery()
      .select('DATE(audit.timestamp)', 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy('DATE(audit.timestamp)')
      .getRawMany();

    // 6. Top users — GROUP BY userId, userName (denormalized), ORDER BY count DESC, LIMIT 10
    const topUsersRows: AggregatedUserRow[] = await baseQuery()
      .select('audit.userId', 'userId')
      .addSelect('audit.userName', 'userName')
      .addSelect('COUNT(*)', 'count')
      .where('audit.userId IS NOT NULL')
      .groupBy('audit.userId')
      .addGroupBy('audit.userName')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // 7. Top projects — GROUP BY projectId, ORDER BY count DESC, LIMIT 10
    const topProjectsRows: AggregatedCountRow[] = await baseQuery()
      .select('audit.projectId', 'key')
      .addSelect('COUNT(*)', 'count')
      .where('audit.projectId IS NOT NULL')
      .groupBy('audit.projectId')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // 8. Security-specific counts — conditional COUNT via WHERE
    const securityEvents = await baseQuery()
      .andWhere('audit.severity IN (:...sevs)', {
        sevs: [AuditSeverity.HIGH, AuditSeverity.CRITICAL],
      })
      .getCount();

    const failedLogins = await baseQuery()
      .andWhere('audit.eventType = :evt', { evt: AuditEventType.LOGIN_FAILED })
      .getCount();

    const suspiciousActivity = await baseQuery()
      .andWhere('audit.eventType = :evt', { evt: AuditEventType.SUSPICIOUS_ACTIVITY })
      .getCount();

    // Transform raw rows into response shape
    const toRecord = (rows: AggregatedCountRow[]): Record<string, number> =>
      Object.fromEntries(rows.map((r) => [r.key, parseInt(r.count, 10)]));

    return {
      totalEvents,
      eventsByType: toRecord(eventsByTypeRows),
      eventsBySeverity: toRecord(eventsBySeverityRows),
      eventsByStatus: toRecord(eventsByStatusRows),
      eventsByUser: toRecord(
        topUsersRows.map((r) => ({ key: r.userId, count: r.count })),
      ),
      eventsByProject: toRecord(topProjectsRows),
      eventsByDay: toRecord(eventsByDayRows),
      topUsers: topUsersRows.map((r) => ({
        userId: r.userId,
        userName: r.userName || 'Unknown',
        count: parseInt(r.count, 10),
      })),
      topProjects: topProjectsRows.map((r) => ({
        projectId: r.key,
        count: parseInt(r.count, 10),
      })),
      securityEvents,
      failedLogins,
      suspiciousActivity,
    };
  }

  /**
   * Clean up expired audit logs
   */
  async cleanupExpiredLogs(): Promise<number> {
    const result = await this.auditLogRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  // ---------------------------------------------------------------------------
  // TENANT ISOLATION — Hard gate
  // ---------------------------------------------------------------------------

  /**
   * Apply mandatory tenant isolation to a QueryBuilder.
   *
   * SECURITY: This is the ONLY place tenant filtering is applied.
   * If organizationId is falsy, we throw ForbiddenException immediately —
   * this prevents ANY cross-tenant query execution, even if controller
   * guards are bypassed.
   *
   * @throws ForbiddenException if organizationId is missing
   */
  private applyTenantFilter(
    qb: SelectQueryBuilder<AuditLog>,
    organizationId: string,
  ): void {
    if (!organizationId) {
      this.logger.error(
        'CRITICAL: Audit query attempted without organizationId — blocked',
      );
      throw new ForbiddenException(
        'Tenant context required for audit log access',
      );
    }
    qb.andWhere('audit.organizationId = :organizationId', { organizationId });
  }

  /**
   * Archive old audit logs
   */
  async archiveOldLogs(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.auditLogRepo.update(
      {
        timestamp: LessThan(cutoffDate),
        isRetained: false,
      },
      {
        isRetained: true,
      },
    );

    return result.affected || 0;
  }

  // Helper methods
  private calculateExpirationDate(eventType: AuditEventType): Date {
    const expirationDate = new Date();

    switch (eventType) {
      case AuditEventType.LOGIN_SUCCESS:
      case AuditEventType.LOGOUT:
        expirationDate.setDate(expirationDate.getDate() + 90); // 90 days
        break;
      case AuditEventType.LOGIN_FAILED:
      case AuditEventType.BRUTE_FORCE_ATTEMPT:
      case AuditEventType.UNAUTHORIZED_ACCESS:
        expirationDate.setDate(expirationDate.getDate() + 365); // 1 year
        break;
      case AuditEventType.USER_DELETED:
      case AuditEventType.PROJECT_DELETED:
        expirationDate.setDate(expirationDate.getDate() + 2555); // 7 years
        break;
      default:
        expirationDate.setDate(expirationDate.getDate() + 180); // 6 months
    }

    return expirationDate;
  }

  private isRetentionRequired(eventType: AuditEventType): boolean {
    const retentionRequired = [
      AuditEventType.USER_DELETED,
      AuditEventType.PROJECT_DELETED,
      AuditEventType.DATA_EXPORT,
      AuditEventType.DATA_IMPORT,
      AuditEventType.CONFIGURATION_CHANGED,
    ];
    return retentionRequired.includes(eventType);
  }

  private isEncryptionRequired(eventType: AuditEventType): boolean {
    const encryptionRequired = [
      AuditEventType.PASSWORD_CHANGE,
      AuditEventType.PASSWORD_RESET,
      AuditEventType.DATA_EXPORT,
      AuditEventType.DATA_IMPORT,
    ];
    return encryptionRequired.includes(eventType);
  }

  private getSeverityForAuthEvent(eventType: AuditEventType): AuditSeverity {
    switch (eventType) {
      case AuditEventType.LOGIN_FAILED:
      case AuditEventType.BRUTE_FORCE_ATTEMPT:
        return AuditSeverity.MEDIUM;
      case AuditEventType.UNAUTHORIZED_ACCESS:
        return AuditSeverity.HIGH;
      default:
        return AuditSeverity.LOW;
    }
  }

  private getSeverityForResourceEvent(
    eventType: AuditEventType,
  ): AuditSeverity {
    switch (eventType) {
      case AuditEventType.USER_DELETED:
      case AuditEventType.PROJECT_DELETED:
        return AuditSeverity.HIGH;
      case AuditEventType.USER_CREATED:
      case AuditEventType.PROJECT_CREATED:
        return AuditSeverity.MEDIUM;
      default:
        return AuditSeverity.LOW;
    }
  }

  private getDescriptionForAuthEvent(
    eventType: AuditEventType,
    userEmail: string,
  ): string {
    switch (eventType) {
      case AuditEventType.LOGIN_SUCCESS:
        return `User ${userEmail} successfully logged in`;
      case AuditEventType.LOGIN_FAILED:
        return `Failed login attempt for ${userEmail}`;
      case AuditEventType.LOGOUT:
        return `User ${userEmail} logged out`;
      case AuditEventType.PASSWORD_CHANGE:
        return `User ${userEmail} changed password`;
      case AuditEventType.TWO_FA_ENABLED:
        return `User ${userEmail} enabled two-factor authentication`;
      case AuditEventType.SAML_LOGIN:
        return `User ${userEmail} logged in via SAML`;
      default:
        return `Authentication event for ${userEmail}`;
    }
  }

  private getDescriptionForResourceEvent(
    eventType: AuditEventType,
    resourceType: string,
    resourceId: string,
  ): string {
    const action = eventType.split('_')[0];
    return `${resourceType} ${action}: ${resourceId}`;
  }
}
