import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditService,
  AuditLogFilter,
  AuditLogStats,
} from '../services/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  AuditLog,
  AuditEventType,
  AuditSeverity,
  AuditStatus,
} from '../entities/audit-log.entity';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { AuditJsonTransformStream } from '../streams/audit-json-transform.stream';
import { TenantContextInterceptor } from '../interceptors/tenant-context.interceptor';

// =============================================================================
// STREAM TIMEOUT CONFIGURATION
// =============================================================================

/**
 * Default maximum stream execution time (5 minutes).
 * Prevents Slowloris-style attacks that hold DB cursors indefinitely.
 * Override via AUDIT_STREAM_TIMEOUT_MS environment variable.
 */
const DEFAULT_STREAM_TIMEOUT_MS = 300_000;

// ---------------------------------------------------------------------------
// Strict Typing for JWT User (Zero `any`)
// ---------------------------------------------------------------------------

/** Typed JWT user payload attached to `req.user` by JwtAuthGuard */
interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
}

/** Express request with typed user from JWT */
interface AuthenticatedRequest extends ExpressRequest {
  user: AuthenticatedUser;
}

@Controller('audit')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class AuditController {
  private readonly logger = new Logger(AuditController.name);
  private readonly streamTimeoutMs: number;

  constructor(
    private auditService: AuditService,
    private configService: ConfigService,
  ) {
    this.streamTimeoutMs = this.configService.get<number>(
      'AUDIT_STREAM_TIMEOUT_MS',
      DEFAULT_STREAM_TIMEOUT_MS,
    );
  }

  @Get('logs')
  @RequirePermission('audit:read')
  async getAuditLogs(
    @Req() req: AuthenticatedRequest,
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
    const organizationId = this.extractOrganizationId(req);

    const filter: AuditLogFilter = {
      organizationId,
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
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('projectId') projectId?: string,
  ): Promise<AuditLogStats> {
    const organizationId = this.extractOrganizationId(req);

    return this.auditService.getAuditStats(
      organizationId,
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
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.extractOrganizationId(req);

    const filter: AuditLogFilter = {
      organizationId,
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
    @Req() req: AuthenticatedRequest,
    @Query('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.extractOrganizationId(req);

    const filter: AuditLogFilter = {
      organizationId,
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
    @Req() req: AuthenticatedRequest,
    @Query('projectId') projectId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = this.extractOrganizationId(req);

    const filter: AuditLogFilter = {
      organizationId,
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
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    const organizationId = this.extractOrganizationId(req);

    const filter: AuditLogFilter = {
      organizationId,
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

  // ===========================================================================
  // STREAMING JSON EXPORT (Memory-Safe, Unbounded)
  // ===========================================================================

  @Get('export/stream')
  @RequirePermission('audit:export')
  async streamExportAuditLogs(
    @Req() req: AuthenticatedRequest,
    @Res() res: ExpressResponse,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<void> {
    const organizationId = this.extractOrganizationId(req);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Set streaming response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-export-${timestamp}.json"`,
    );
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache, no-store');

    // Get the raw TypeORM ReadStream
    const dbStream = (await this.auditService.exportAuditLogsStream(
      organizationId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    )) as unknown as Readable;

    // Transform: raw DB rows → valid JSON array
    const jsonTransform = new AuditJsonTransformStream();

    // =========================================================================
    // ZOMBIE CONNECTION CLEANUP
    // =========================================================================
    // If the client disconnects mid-download, destroy the DB stream
    // immediately to release the PostgreSQL cursor and return the
    // connection to the pool.
    const cleanup = (): void => {
      if (!dbStream.destroyed) {
        dbStream.destroy();
        this.logger.warn(
          `Stream export aborted: client disconnected (org=${organizationId})`,
        );
      }
    };

    req.on('close', cleanup);
    res.on('error', cleanup);

    // =========================================================================
    // STREAM TIMEOUT (Anti-Tarpit)
    // =========================================================================
    // Prevents Slowloris-style attacks where a malicious client reads at
    // 1 byte/sec, holding the PostgreSQL cursor open indefinitely.
    // AbortController lets us trigger from both timeout AND cleanup.
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.logger.warn(
        `Stream export timed out after ${this.streamTimeoutMs}ms (org=${organizationId})`,
      );
      abortController.abort();
      cleanup();
    }, this.streamTimeoutMs);

    try {
      // pipeline() handles backpressure automatically:
      // HTTP slow → Transform pauses → DB stream pauses → no buffer bloat
      await pipeline(dbStream, jsonTransform, res, {
        signal: abortController.signal,
      });
    } catch (error) {
      // pipeline throws if any stream errors or is destroyed early.
      // Client disconnect errors are expected — only log unexpected ones.
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Stream export failed',
        });
      }

      const errMessage = error instanceof Error ? error.message : String(error);

      // Suppress client-abort noise in logs
      if (
        !errMessage.includes('aborted') &&
        !errMessage.includes('ECONNRESET')
      ) {
        this.logger.error(
          `Stream export error (org=${organizationId}): ${errMessage}`,
        );
      }
    } finally {
      clearTimeout(timeoutId);
      req.removeListener('close', cleanup);
      res.removeListener('error', cleanup);
    }
  }

  private exportToCSV(logs: AuditLog[]): string {
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

    logs.forEach((log: AuditLog) => {
      const row = [
        log.timestamp.toISOString(),
        log.eventType,
        log.severity,
        log.status,
        `"${log.description.replace(/"/g, '""')}"`,
        log.userEmail || '',
        log.userName || '',
        log.ipAddress || '',
        log.resourceType || '',
        log.resourceId || '',
        log.projectId || '',
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private: Tenant Context Extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract organizationId from authenticated JWT user.
   * Throws ForbiddenException if the tenant context is missing.
   */
  private extractOrganizationId(req: AuthenticatedRequest): string {
    const orgId = req.user?.organizationId;
    if (!orgId) {
      throw new ForbiddenException(
        'Organization context required for audit access',
      );
    }
    return orgId;
  }
}
