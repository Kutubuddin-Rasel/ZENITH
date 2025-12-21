import {
    Controller,
    Get,
    Delete,
    Param,
    UseGuards,
    Request,
    HttpCode,
    HttpStatus,
    NotFoundException,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthRequest {
    user: {
        userId: string;
        sessionId?: string;
        currentTokenHash?: string;
    };
}

@Controller('users/me/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
    constructor(private readonly sessionsService: SessionsService) { }

    /**
     * GET /users/me/sessions
     * List all active sessions for the current user
     * Returns device info, location, timestamps (NEVER the token)
     */
    @Get()
    async listSessions(@Request() req: AuthRequest) {
        const sessions = await this.sessionsService.listUserSessions(
            req.user.userId,
            req.user.currentTokenHash,
        );

        return {
            sessions,
            total: sessions.length,
        };
    }

    /**
     * DELETE /users/me/sessions/:id
     * Revoke a specific session (log out that device)
     */
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async revokeSession(
        @Param('id') sessionId: string,
        @Request() req: AuthRequest,
    ) {
        const success = await this.sessionsService.revokeSession(
            sessionId,
            req.user.userId,
        );

        if (!success) {
            throw new NotFoundException('Session not found');
        }

        return {
            success: true,
            message: 'Session revoked successfully',
        };
    }

    /**
     * DELETE /users/me/sessions
     * Revoke all sessions except current (log out everywhere else)
     */
    @Delete()
    @HttpCode(HttpStatus.OK)
    async revokeAllSessions(@Request() req: AuthRequest) {
        // If we have the current session ID, preserve it
        const currentSessionId = req.user.sessionId;

        let revokedCount: number;
        if (currentSessionId) {
            revokedCount = await this.sessionsService.revokeAllExceptCurrent(
                req.user.userId,
                currentSessionId,
            );
        } else {
            // No current session info, revoke all
            revokedCount = await this.sessionsService.revokeAllSessions(
                req.user.userId,
            );
        }

        return {
            success: true,
            message: `${revokedCount} session(s) revoked`,
            revokedCount,
        };
    }
}
