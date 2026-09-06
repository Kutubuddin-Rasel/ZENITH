import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Session, SessionStatus } from '../entities/session.entity';
import {
  SESSION_AUDITOR_TOKEN,
  SESSION_CONFIG_TOKEN,
  SESSION_STORE_TOKEN,
} from '../constants/session.tokens';
import {
  ISessionAuditor,
  ISessionConfig,
  ISessionSecurity,
  ISessionStore,
} from '../interfaces/session.interfaces';

/**
 * {@link ISessionSecurity} — suspicious-activity detection, session locking,
 * and concurrent-session enforcement.
 */
@Injectable()
export class SessionSecurityService extends ISessionSecurity {
  constructor(
    @Inject(SESSION_STORE_TOKEN) private readonly store: ISessionStore,
    @Inject(SESSION_CONFIG_TOKEN) private readonly config: ISessionConfig,
    @Inject(SESSION_AUDITOR_TOKEN) private readonly auditor: ISessionAuditor,
  ) {
    super();
  }

  async checkSuspiciousActivity(session: Session): Promise<void> {
    const suspiciousIndicators: string[] = [];

    if (session.requestCount > 1000) {
      suspiciousIndicators.push('High request count');
    }

    const recentSessions = await this.store.findRecentActiveByUser(
      session.userId,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    const uniqueIPs = new Set(
      recentSessions.map((s) => s.ipAddress).filter(Boolean),
    );
    if (uniqueIPs.size > 5) {
      suspiciousIndicators.push('Multiple IP addresses');
    }

    const uniqueUserAgents = new Set(
      recentSessions.map((s) => s.userAgent).filter(Boolean),
    );
    if (uniqueUserAgents.size > 3) {
      suspiciousIndicators.push('Multiple user agents');
    }

    if (suspiciousIndicators.length > 0) {
      await this.store.updateBySessionId(session.sessionId, {
        isSuspicious: true,
        suspiciousActivity: {
          indicators: suspiciousIndicators,
          detectedAt: new Date().toISOString(),
          requestCount: session.requestCount,
        },
      });

      await this.auditor.suspiciousActivity({
        sessionId: session.sessionId,
        userId: session.userId,
        indicators: suspiciousIndicators,
        requestCount: session.requestCount,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      });
    }
  }

  async lockSession(
    sessionId: string,
    lockedBy: string,
    reason: string,
  ): Promise<void> {
    // BUG #2 FIX: resolve the owning userId BEFORE the status change. The
    // legacy code read the session via the ACTIVE-only getSession() *after*
    // setting status to SUSPENDED, so the audit userId always resolved to
    // undefined. findById() is status-agnostic and is read first.
    const existing = await this.store.findById(sessionId);

    await this.store.updateBySessionId(sessionId, {
      isLocked: true,
      lockedAt: new Date(),
      lockedBy,
      lockReason: reason,
      status: SessionStatus.SUSPENDED,
    });

    await this.auditor.sessionLocked({
      sessionId,
      userId: existing?.userId,
      lockedBy,
      reason,
    });
  }

  async checkConcurrentSessionLimit(userId: string): Promise<void> {
    const activeSessions = await this.store.countActiveByUser(userId);

    if (activeSessions >= this.config.maxConcurrentSessions) {
      throw new ConflictException(
        `Maximum concurrent sessions limit reached (${this.config.maxConcurrentSessions})`,
      );
    }
  }

  async updateConcurrentSessionCount(userId: string): Promise<void> {
    const activeSessions = await this.store.findActiveByUser(userId);

    const concurrentCount = activeSessions.length;
    const isConcurrent = concurrentCount > 1;

    await this.store.updateActiveByUser(userId, {
      concurrentCount,
      isConcurrent,
    });
  }
}
