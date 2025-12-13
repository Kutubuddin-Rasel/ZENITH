import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  AuditLog,
  AuditEventType,
  AuditSeverity,
  AuditStatus,
} from '../entities/audit-log.entity';
import { User } from '../../users/entities/user.entity';

export interface AuditLogData {
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

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Log an audit event
   */
  async log(data: AuditLogData): Promise<AuditLog> {
    const auditLog = new AuditLog();
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

    return this.auditLogRepo.save(auditLog);
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
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
   * Get audit log statistics
   */
  async getAuditStats(
    startDate?: Date,
    endDate?: Date,
    projectId?: string,
  ): Promise<AuditLogStats> {
    const query = this.auditLogRepo.createQueryBuilder('audit');

    if (startDate) {
      query.andWhere('audit.timestamp >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('audit.timestamp <= :endDate', { endDate });
    }
    if (projectId) {
      query.andWhere('audit.projectId = :projectId', { projectId });
    }

    const logs = await query.getMany();

    const stats: AuditLogStats = {
      totalEvents: logs.length,
      eventsByType: {},
      eventsBySeverity: {},
      eventsByStatus: {},
      eventsByUser: {},
      eventsByProject: {},
      eventsByDay: {},
      topUsers: [],
      topProjects: [],
      securityEvents: 0,
      failedLogins: 0,
      suspiciousActivity: 0,
    };

    logs.forEach((log) => {
      // Count by type
      stats.eventsByType[log.eventType] =
        (stats.eventsByType[log.eventType] || 0) + 1;

      // Count by severity
      stats.eventsBySeverity[log.severity] =
        (stats.eventsBySeverity[log.severity] || 0) + 1;

      // Count by status
      stats.eventsByStatus[log.status] =
        (stats.eventsByStatus[log.status] || 0) + 1;

      // Count by user
      if (log.userId) {
        stats.eventsByUser[log.userId] =
          (stats.eventsByUser[log.userId] || 0) + 1;
      }

      // Count by project
      if (log.projectId) {
        stats.eventsByProject[log.projectId] =
          (stats.eventsByProject[log.projectId] || 0) + 1;
      }

      // Count by day
      const day = log.timestamp.toISOString().split('T')[0];
      stats.eventsByDay[day] = (stats.eventsByDay[day] || 0) + 1;

      // Security events
      if (
        log.severity === AuditSeverity.HIGH ||
        log.severity === AuditSeverity.CRITICAL
      ) {
        stats.securityEvents++;
      }

      // Failed logins
      if (log.eventType === AuditEventType.LOGIN_FAILED) {
        stats.failedLogins++;
      }

      // Suspicious activity
      if (log.eventType === AuditEventType.SUSPICIOUS_ACTIVITY) {
        stats.suspiciousActivity++;
      }
    });

    // Get top users
    stats.topUsers = Object.entries(stats.eventsByUser)
      .map(([userId, count]) => {
        const log = logs.find((l) => l.userId === userId);
        return {
          userId,
          userName: log?.userName || 'Unknown',
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get top projects
    stats.topProjects = Object.entries(stats.eventsByProject)
      .map(([projectId, count]) => ({ projectId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
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
