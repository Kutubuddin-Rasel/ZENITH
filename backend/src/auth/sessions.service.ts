import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { UserSession } from './entities/user-session.entity';
import * as crypto from 'crypto';

// Simple user-agent parsing (lightweight, no external dependency)
function parseUserAgent(userAgent: string | null): {
    browser: string;
    os: string;
    deviceType: string;
} {
    if (!userAgent) {
        return { browser: 'Unknown', os: 'Unknown', deviceType: 'unknown' };
    }

    const ua = userAgent.toLowerCase();

    // Device type detection
    let deviceType = 'desktop';
    if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
        deviceType = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';
    }

    // OS detection
    let os = 'Unknown';
    if (ua.includes('windows nt 10')) os = 'Windows 10/11';
    else if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os x')) os = 'macOS';
    else if (ua.includes('iphone')) os = 'iOS';
    else if (ua.includes('ipad')) os = 'iPadOS';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('linux')) os = 'Linux';

    // Browser detection
    let browser = 'Unknown';
    if (ua.includes('edg/')) browser = 'Edge';
    else if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

    return { browser, os, deviceType };
}

@Injectable()
export class SessionsService {
    constructor(
        @InjectRepository(UserSession)
        private readonly sessionRepo: Repository<UserSession>,
    ) { }

    /**
     * Create a new session when user logs in
     */
    async createSession(
        userId: string,
        refreshToken: string,
        userAgent: string | null,
        ipAddress: string | null,
        expiresAt: Date,
    ): Promise<UserSession> {
        const { browser, os, deviceType } = parseUserAgent(userAgent);

        // Hash the token for storage
        const tokenHash = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');

        const session = this.sessionRepo.create({
            userId,
            tokenHash,
            userAgent,
            browser,
            os,
            deviceType,
            ipAddress,
            expiresAt,
            lastUsedAt: new Date(),
        });

        return this.sessionRepo.save(session);
    }

    /**
     * Update last used time when token is refreshed
     */
    async touchSession(tokenHash: string): Promise<void> {
        await this.sessionRepo.update(
            { tokenHash },
            { lastUsedAt: new Date() },
        );
    }

    /**
     * Find session by token hash
     */
    async findByToken(refreshToken: string): Promise<UserSession | null> {
        const tokenHash = crypto
            .createHash('sha256')
            .update(refreshToken)
            .digest('hex');

        return this.sessionRepo.findOne({
            where: { tokenHash },
        });
    }

    /**
     * List all active sessions for a user
     */
    async listUserSessions(
        userId: string,
        currentTokenHash?: string,
    ): Promise<Array<{
        id: string;
        deviceType: string | null;
        browser: string | null;
        os: string | null;
        ipAddress: string | null;
        location: string | null;
        createdAt: Date;
        lastUsedAt: Date | null;
        isCurrent: boolean;
    }>> {
        const sessions = await this.sessionRepo.find({
            where: { userId },
            order: { lastUsedAt: 'DESC' },
            select: [
                'id',
                'deviceType',
                'browser',
                'os',
                'ipAddress',
                'location',
                'createdAt',
                'lastUsedAt',
                'tokenHash',
            ],
        });

        // Remove expired sessions
        const now = new Date();
        const activeSessions = sessions.filter(
            (s) => !s.expiresAt || new Date(s.expiresAt) > now,
        );

        return activeSessions.map((s) => ({
            id: s.id,
            deviceType: s.deviceType,
            browser: s.browser,
            os: s.os,
            ipAddress: s.ipAddress,
            location: s.location,
            createdAt: s.createdAt,
            lastUsedAt: s.lastUsedAt,
            isCurrent: currentTokenHash ? s.tokenHash === currentTokenHash : false,
        }));
    }

    /**
     * Revoke a specific session
     */
    async revokeSession(sessionId: string, userId: string): Promise<boolean> {
        const result = await this.sessionRepo.delete({
            id: sessionId,
            userId, // Ensure user owns this session
        });
        return (result.affected ?? 0) > 0;
    }

    /**
     * Revoke all sessions except current
     */
    async revokeAllExceptCurrent(
        userId: string,
        currentSessionId: string,
    ): Promise<number> {
        const result = await this.sessionRepo.delete({
            userId,
            id: Not(currentSessionId),
        });
        return result.affected ?? 0;
    }

    /**
     * Revoke all user sessions (for logout everywhere)
     */
    async revokeAllSessions(userId: string): Promise<number> {
        const result = await this.sessionRepo.delete({ userId });
        return result.affected ?? 0;
    }

    /**
     * Clean up expired sessions (run periodically)
     */
    async cleanupExpired(): Promise<number> {
        const result = await this.sessionRepo
            .createQueryBuilder()
            .delete()
            .where('expiresAt < :now', { now: new Date() })
            .execute();
        return result.affected ?? 0;
    }

    /**
     * Get session count for a user
     */
    async getSessionCount(userId: string): Promise<number> {
        return this.sessionRepo.count({ where: { userId } });
    }

    /**
     * Hash a token for comparison
     */
    hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}
