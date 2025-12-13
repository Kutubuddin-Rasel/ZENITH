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
} from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateSessionData, SessionInfo } from './session.service';
import { SessionType } from './entities/session.entity';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';

export class TerminateSessionDto {
  sessionId: string;
  reason?: string;
}

export class LockSessionDto {
  sessionId: string;
  reason: string;
}

export class SessionQueryDto {
  userId?: string;
  status?: string;
  type?: SessionType;
  page?: number;
  limit?: number;
}

@Controller('sessions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionController {
  constructor(private sessionService: SessionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('session:create')
  async createSession(
    @Request() req: AuthenticatedRequest,
    @Body() createSessionData: CreateSessionData,
  ): Promise<{ sessionId: string; expiresAt: Date }> {
    const session = await this.sessionService.createSession({
      ...createSessionData,
      userId: req.user.userId,
      ipAddress: req.ip || '',
      userAgent: req.headers?.['user-agent'] || '',
    });

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    };
  }

  @Get('my-sessions')
  @RequirePermission('session:read')
  async getMySessions(
    @Request() req: AuthenticatedRequest,
  ): Promise<SessionInfo[]> {
    return this.sessionService.getUserSessions(req.user.userId);
  }

  @Get('all')
  @RequirePermission('session:read:all')
  async getAllSessions(@Query() query: SessionQueryDto): Promise<{
    sessions: SessionInfo[];
    total: number;
    page: number;
    limit: number;
  }> {
    // This would need to be implemented in the service for pagination
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

  @Get('stats')
  @RequirePermission('session:read:stats')
  async getSessionStats(): Promise<Record<string, unknown>> {
    return this.sessionService.getSessionStats();
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('session:terminate')
  async terminateSession(
    @Param('sessionId') sessionId: string,
    @Request() req: AuthenticatedRequest,
    @Body() body: { reason?: string },
  ): Promise<void> {
    await this.sessionService.terminateSession(
      sessionId,
      req.user.userId,
      body.reason,
    );
  }

  @Delete('my-sessions/all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('session:terminate:own')
  async terminateAllMySessions(
    @Request() req: AuthenticatedRequest & { sessionID?: string },
    @Body() body: { reason?: string; exceptCurrent?: boolean },
  ): Promise<{ terminatedCount: number }> {
    const exceptSessionId = body.exceptCurrent ? req.sessionID : undefined;
    const terminatedCount = await this.sessionService.terminateAllUserSessions(
      req.user.userId,
      exceptSessionId,
      req.user.userId,
      body.reason,
    );

    return { terminatedCount };
  }

  @Post(':sessionId/lock')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:lock')
  async lockSession(
    @Param('sessionId') sessionId: string,
    @Body() lockSessionDto: LockSessionDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.sessionService.lockSession(
      sessionId,
      req.user.userId,
      lockSessionDto.reason,
    );
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:cleanup')
  async cleanupExpiredSessions(): Promise<{ cleanedCount: number }> {
    const cleanedCount = await this.sessionService.cleanupExpiredSessions();
    return { cleanedCount };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('session:refresh')
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
