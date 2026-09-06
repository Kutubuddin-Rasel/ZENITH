import { Inject, Injectable, Logger } from '@nestjs/common';
import { SessionStatus } from '../entities/session.entity';
import {
  SESSION_AUDITOR_TOKEN,
  SESSION_SECURITY_TOKEN,
  SESSION_STORE_TOKEN,
} from '../constants/session.tokens';
import {
  ISessionAuditor,
  ISessionLifecycle,
  ISessionSecurity,
  ISessionStore,
} from '../interfaces/session.interfaces';

/**
 * {@link ISessionLifecycle} — termination and expiry cleanup.
 */
@Injectable()
export class SessionLifecycleService extends ISessionLifecycle {
  private readonly logger = new Logger(SessionLifecycleService.name);

  constructor(
    @Inject(SESSION_STORE_TOKEN) private readonly store: ISessionStore,
    @Inject(SESSION_SECURITY_TOKEN) private readonly security: ISessionSecurity,
    @Inject(SESSION_AUDITOR_TOKEN) private readonly auditor: ISessionAuditor,
  ) {
    super();
  }

  async terminateSession(
    sessionId: string,
    terminatedBy?: string,
    reason?: string,
  ): Promise<void> {
    const session = await this.store.findActiveById(sessionId);
    if (!session) {
      return;
    }

    await this.store.updateBySessionId(sessionId, {
      status: SessionStatus.TERMINATED,
      terminatedAt: new Date(),
      terminatedBy,
      terminationReason: reason,
    });

    await this.security.updateConcurrentSessionCount(session.userId);

    await this.auditor.sessionTerminated({
      sessionId,
      userId: session.userId,
      terminatedBy,
      reason,
      sessionDurationMs: Date.now() - session.createdAt.getTime(),
    });

    this.logger.log(`Session terminated: ${sessionId}`);
  }

  async terminateAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    terminatedBy?: string,
    reason?: string,
  ): Promise<number> {
    // BUG #1 FIX (verified): the exclusion is enforced in the store via
    // `Not(exceptSessionId)`. Here we simply forward the filter — the legacy
    // Mongo `{ $ne }` syntax that TypeORM ignored is gone.
    const sessions = await this.store.findActiveByUser(userId, exceptSessionId);

    for (const session of sessions) {
      await this.terminateSession(session.sessionId, terminatedBy, reason);
    }

    return sessions.length;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const expiredSessions = await this.store.findExpiredActive(new Date());

    for (const session of expiredSessions) {
      await this.terminateSession(
        session.sessionId,
        'system',
        'Session expired',
      );
    }

    this.logger.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    return expiredSessions.length;
  }
}
