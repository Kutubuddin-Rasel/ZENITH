import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  AuditService,
  AuditLogFilter,
  AuditLogStats,
} from '../services/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  AuditEventType,
  AuditSeverity,
  AuditStatus,
} from '../entities/audit-log.entity';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get('logs')
  @RequirePermission('audit:read')
  async getAuditLogs(
    @Query('eventTypes') eventTypes?: string,
    @Query('severities') severities?: string,
    @Query('statuses') statuses?: string,
    @Query('userIds') userIds?: string,
    @Query('projectIds') projectIds?: string,
    @Query('resourceTypes') resourceTypes?: string,
    @Query('resourceIds') resourceIds?: string,
    @Query('ipAddresses') ipAddresses?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('orderBy') orderBy?: string,
    @Query('orderDirection') orderDirection?: string,
  ) {
    const filter: AuditLogFilter = {
      eventTypes: eventTypes
        ? (eventTypes.split(',') as AuditEventType[])
        : undefined,
      severities: severities
        ? (severities.split(',') as AuditSeverity[])
        : undefined,
      statuses: statuses ? (statuses.split(',') as AuditStatus[]) : undefined,
      userIds: userIds ? userIds.split(',') : undefined,
      projectIds: projectIds ? projectIds.split(',') : undefined,
      resourceTypes: resourceTypes ? resourceTypes.split(',') : undefined,
      resourceIds: resourceIds ? resourceIds.split(',') : undefined,
      ipAddresses: ipAddresses ? ipAddresses.split(',') : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      orderBy: orderBy as 'timestamp' | 'severity' | 'eventType' | undefined,
      orderDirection: orderDirection as 'ASC' | 'DESC' | undefined,
    };

    return this.auditService.getAuditLogs(filter);
  }

  @Get('stats')
  @RequirePermission('audit:read')
  async getAuditStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('projectId') projectId?: string,
  ): Promise<AuditLogStats> {
    return this.auditService.getAuditStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      projectId,
    );
  }

  @Get('events/types')
  @RequirePermission('audit:read')
  getEventTypes() {
    return {
      eventTypes: Object.values(AuditEventType),
      severities: Object.values(AuditSeverity),
      statuses: Object.values(AuditStatus),
    };
  }

  @Get('security/events')
  @RequirePermission('audit:read')
  async getSecurityEvents(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: AuditLogFilter = {
      severities: [AuditSeverity.HIGH, AuditSeverity.CRITICAL],
      eventTypes: [
        AuditEventType.LOGIN_FAILED,
        AuditEventType.BRUTE_FORCE_ATTEMPT,
        AuditEventType.UNAUTHORIZED_ACCESS,
        AuditEventType.SUSPICIOUS_ACTIVITY,
        AuditEventType.PASSWORD_CHANGE,
        AuditEventType.TWO_FA_ENABLED,
        AuditEventType.TWO_FA_DISABLED,
      ],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
      orderBy: 'timestamp',
      orderDirection: 'DESC',
    };

    return this.auditService.getAuditLogs(filter);
  }

  @Get('user/:userId/activity')
  @RequirePermission('audit:read')
  async getUserActivity(
    @Query('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: AuditLogFilter = {
      userIds: [userId],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      orderBy: 'timestamp',
      orderDirection: 'DESC',
    };

    return this.auditService.getAuditLogs(filter);
  }

  @Get('project/:projectId/activity')
  @RequirePermission('audit:read')
  async getProjectActivity(
    @Query('projectId') projectId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const filter: AuditLogFilter = {
      projectIds: [projectId],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      orderBy: 'timestamp',
      orderDirection: 'DESC',
    };

    return this.auditService.getAuditLogs(filter);
  }

  @Post('cleanup')
  @RequirePermission('audit:admin')
  @HttpCode(HttpStatus.OK)
  async cleanupExpiredLogs() {
    const deletedCount = await this.auditService.cleanupExpiredLogs();
    return {
      message: `Cleaned up ${deletedCount} expired audit logs`,
      deletedCount,
    };
  }

  @Post('archive')
  @RequirePermission('audit:admin')
  @HttpCode(HttpStatus.OK)
  async archiveOldLogs(@Query('olderThanDays') olderThanDays?: string) {
    const days = olderThanDays ? parseInt(olderThanDays, 10) : 90;

    if (days < 30) {
      throw new BadRequestException('Archive period must be at least 30 days');
    }

    const archivedCount = await this.auditService.archiveOldLogs(days);
    return {
      message: `Archived ${archivedCount} audit logs older than ${days} days`,
      archivedCount,
    };
  }

  @Get('export')
  @RequirePermission('audit:export')
  async exportAuditLogs(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    const filter: AuditLogFilter = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: 10000, // Limit export size
      orderBy: 'timestamp',
      orderDirection: 'DESC',
    };

    const { logs } = await this.auditService.getAuditLogs(filter);

    if (format === 'csv') {
      return this.exportToCSV(logs);
    }

    return {
      logs,
      exportedAt: new Date().toISOString(),
      totalRecords: logs.length,
    };
  }

  private exportToCSV(logs: any[]): string {
    const headers = [
      'Timestamp',
      'Event Type',
      'Severity',
      'Status',
      'Description',
      'User Email',
      'User Name',
      'IP Address',
      'Resource Type',
      'Resource ID',
      'Project ID',
    ];

    const csvRows = [headers.join(',')];

    logs.forEach((log: Record<string, unknown>) => {
      const row = [
        log.timestamp as string,
        log.eventType as string,
        log.severity as string,
        log.status as string,
        `"${(log.description as string).replace(/"/g, '""')}"`,
        (log.userEmail as string) || '',
        (log.userName as string) || '',
        (log.ipAddress as string) || '',
        (log.resourceType as string) || '',
        (log.resourceId as string) || '',
        (log.projectId as string) || '',
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }
}
