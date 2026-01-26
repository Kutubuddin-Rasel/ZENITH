import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateSessionData, SessionInfo } from './session.service';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';

// DTOs with strict validation
import { TerminateSessionDto, LockSessionDto, SessionQueryDto } from './dto';

/**
 * Session Controller (Legacy Enterprise Session Management)
 *
 * SECURITY:
 * - All endpoints require JwtAuthGuard + PermissionsGuard
 * - State-changing methods require CSRF protection via @RequireCsrf()
 * - Uses StatefulCsrfGuard for Redis-backed token verification
 * - All inputs validated via class-validator DTOs
 *
 * DTO VALIDATION:
 * - @IsUUID prevents SQL injection via malformed IDs
 * - @Length limits strings to prevent storage DoS
 * - @IsEnum validates status/type values
 * - @Max(100) limits pagination to prevent query DoS
 */
@Controller('sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard, StatefulCsrfGuard)
export class SessionController {
  constructor(private sessionService: SessionService) {}

  /**
   * Create a new session
   *
   * CSRF REQUIRED: State-changing operation
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('session:create')
  @RequireCsrf()
  async createSession(
    @Request() req: AuthenticatedRequest,
    @Body() createSessionData: CreateSessionData,
  ): Promise<{ sessionId: string; expiresAt: Date }> {
    const session = await this.sessionService.createSession({
      ...createSessionData,
      userId: req.user.userId,
      ipAddress: req.ip || '',
      userAgent: req.headers?.['user-agent'] || '',
      // Determine secure connection status from request headers/protocol
      isSecure: this.sessionService.isSecureConnection(req),
    });

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Get all sessions for the current user
   *
   * No CSRF required - read-only operation
   */
  @Get('my-sessions')
  @RequirePermission('session:read')
  async getMySessions(
    @Request() req: AuthenticatedRequest,
  ): Promise<SessionInfo[]> {
    return this.sessionService.getUserSessions(req.user.userId);
  }

  /**
   * Get all sessions (admin view)
   *
   * No CSRF required - read-only operation
   * Query parameters validated via SessionQueryDto
   */
  @Get('all')
  @RequirePermission('session:read:all')
  async getAllSessions(@Query() query: SessionQueryDto): Promise<{
    sessions: SessionInfo[];
    total: number;
    page: number;
    limit: number;
  }> {
    const sessions = await this.sessionService.getUserSessions(
      query.userId || '',
    );

    return {
      sessions,
      total: sessions.length,
      page: query.page || 1,
      limit: query.limit || 10,
    };
  }

  /**
   * Get session statistics
   *
   * No CSRF required - read-only operation
   */
  @Get('stats')
  @RequirePermission('session:read:stats')
  async getSessionStats(): Promise<Record<string, unknown>> {
    return this.sessionService.getSessionStats();
  }

  /**
   * Terminate a specific session
   *
   * CSRF REQUIRED: State-changing operation
   * Could be exploited to forcefully log out users
   *
   * @param sessionId - Validated as UUID via ParseUUIDPipe
   * @param dto - Optional termination reason (validated)
   */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('session:terminate')
  @RequireCsrf()
  async terminateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: TerminateSessionDto,
  ): Promise<void> {
    await this.sessionService.terminateSession(
      sessionId,
      req.user.userId,
      dto.reason,
    );
  }

  /**
   * Terminate all sessions for the current user
   *
   * CSRF REQUIRED: High-security state-changing operation
   * Mass session termination is a destructive action
   *
   * @param dto - Optional reason and exceptCurrent flag (validated)
   */
  @Delete('my-sessions/all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('session:terminate:own')
  @RequireCsrf()
  async terminateAllMySessions(
    @Request() req: AuthenticatedRequest & { sessionID?: string },
    @Body() dto: TerminateSessionDto,
  ): Promise<{ terminatedCount: number }> {
    const exceptSessionId = dto.exceptCurrent ? req.sessionID : undefined;
    const terminatedCount = await this.sessionService.terminateAllUserSessions(
      req.user.userId,
      exceptSessionId,
      req.user.userId,
      dto.reason,
    );

    return { terminatedCount };
  }

  /**
   * Lock a session (admin action)
   *
   * CSRF REQUIRED: State-changing security operation
   * Could be exploited to lock users out of their sessions
   *
   * @param sessionId - Validated as UUID via ParseUUIDPipe
   * @param dto - Lock reason (REQUIRED, validated)
   */
  @Post(':sessionId/lock')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:lock')
  @RequireCsrf()
  async lockSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: LockSessionDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.sessionService.lockSession(
      sessionId,
      req.user.userId,
      dto.reason,
    );
  }

  /**
   * Cleanup expired sessions (admin/cron action)
   *
   * CSRF REQUIRED: State-changing operation
   * Deletes data from the database
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:cleanup')
  @RequireCsrf()
  async cleanupExpiredSessions(): Promise<{ cleanedCount: number }> {
    const cleanedCount = await this.sessionService.cleanupExpiredSessions();
    return { cleanedCount };
  }

  /**
   * Refresh current session's expiration
   *
   * CSRF REQUIRED: State-changing operation
   * Extends session lifetime
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:refresh')
  @RequireCsrf()
  async refreshSession(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ expiresAt: Date }> {
    await this.sessionService.updateSessionActivity(
      req.sessionID || '',
      req.ip || '',
    );
    const session = await this.sessionService.getSession(req.sessionID || '');

    return {
      expiresAt: session?.expiresAt || new Date(),
    };
  }
}
