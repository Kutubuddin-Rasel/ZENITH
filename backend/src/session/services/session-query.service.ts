import { Inject, Injectable } from '@nestjs/common';
import { Session, SessionStatus } from '../entities/session.entity';
import { SESSION_STORE_TOKEN } from '../constants/session.tokens';
import {
  ISessionQuery,
  ISessionStore,
  SessionInfo,
  SessionStats,
} from '../interfaces/session.interfaces';

/**
 * {@link ISessionQuery} — read side. Owns session projection and statistics.
 */
@Injectable()
export class SessionQueryService extends ISessionQuery {
  constructor(
    @Inject(SESSION_STORE_TOKEN) private readonly store: ISessionStore,
  ) {
    super();
  }

  getSession(sessionId: string): Promise<Session | null> {
    return this.store.findActiveById(sessionId);
  }

  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.store.findActiveByUser(userId);
    return sessions.map((session) => this.mapSessionToInfo(session));
  }

  async getSessionStats(): Promise<SessionStats> {
    const [active, expired, terminated, suspicious, locked] = await Promise.all(
      [
        this.store.countByStatus(SessionStatus.ACTIVE),
        this.store.countByStatus(SessionStatus.EXPIRED),
        this.store.countByStatus(SessionStatus.TERMINATED),
        this.store.countSuspicious(),
        this.store.countLocked(),
      ],
    );

    const activeSessions = await this.store.findAllActive();

    const averageDuration =
      activeSessions.length > 0
        ? activeSessions.reduce((sum, session) => {
            return sum + (Date.now() - session.createdAt.getTime());
          }, 0) / activeSessions.length
        : 0;

    return {
      totalActive: active,
      totalExpired: expired,
      totalTerminated: terminated,
      totalSuspicious: suspicious,
      totalLocked: locked,
      averageSessionDuration: averageDuration,
      concurrentSessions: activeSessions.filter((s) => s.isConcurrent).length,
    };
  }

  private mapSessionToInfo(session: Session): SessionInfo {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      status: session.status,
      type: session.type,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent || undefined,
      ipAddress: session.ipAddress || undefined,
      country: session.country || undefined,
      city: session.city || undefined,
      region: session.region || undefined,
      deviceInfo: {
        deviceName: session.deviceName || undefined,
        osName: session.osName || undefined,
        osVersion: session.osVersion || undefined,
        browserName: session.browserName || undefined,
        browserVersion: session.browserVersion || undefined,
        isMobile: session.isMobile,
        isTablet: session.isTablet,
        isDesktop: session.isDesktop,
      },
      isConcurrent: session.isConcurrent,
      concurrentCount: session.concurrentCount,
      requestCount: session.requestCount,
      isSecure: session.isSecure,
      isRememberMe: session.isRememberMe,
      isTwoFactorVerified: session.isTwoFactorVerified,
      isSuspicious: session.isSuspicious,
      isLocked: session.isLocked,
      createdAt: session.createdAt,
    };
  }
}
