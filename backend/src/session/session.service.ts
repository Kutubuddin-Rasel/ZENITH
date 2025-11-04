import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Session, SessionStatus, SessionType } from './entities/session.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../audit/entities/audit-log.entity';
import * as crypto from 'crypto';
import * as UAParser from 'ua-parser-js';

export interface CreateSessionData {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  type?: SessionType;
  isRememberMe?: boolean;
  metadata?: Record<string, any>;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  type: SessionType;
  lastActivity: Date;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  region?: string;
  deviceInfo?: {
    deviceName?: string;
    osName?: string;
    osVersion?: string;
    browserName?: string;
    browserVersion?: string;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
  };
  isConcurrent: boolean;
  concurrentCount: number;
  requestCount: number;
  isSecure: boolean;
  isRememberMe: boolean;
  isTwoFactorVerified: boolean;
  isSuspicious: boolean;
  isLocked: boolean;
  createdAt: Date;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly maxConcurrentSessions: number;
  private readonly sessionTimeoutMinutes: number;
  private readonly rememberMeDays: number;

  constructor(
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    this.maxConcurrentSessions =
      this.configService.get<number>('MAX_CONCURRENT_SESSIONS') || 5;
    this.sessionTimeoutMinutes =
      this.configService.get<number>('SESSION_TIMEOUT_MINUTES') || 30;
    this.rememberMeDays =
      this.configService.get<number>('REMEMBER_ME_DAYS') || 30;
  }

  /**
   * Create a new session
   */
  async createSession(data: CreateSessionData): Promise<Session> {
    const user = await this.userRepo.findOne({ where: { id: data.userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check concurrent session limit
    await this.checkConcurrentSessionLimit(data.userId);

    // Parse user agent
    const deviceInfo = this.parseUserAgent(data.userAgent || '');

    // Generate session ID
    const sessionId = this.generateSessionId();

    // Calculate expiration time
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.sessionTimeoutMinutes * 60 * 1000,
    );
    const rememberUntil = data.isRememberMe
      ? new Date(now.getTime() + this.rememberMeDays * 24 * 60 * 60 * 1000)
      : null;

    // Create session
    const session = this.sessionRepo.create({
      sessionId,
      userId: data.userId,
      status: SessionStatus.ACTIVE,
      type: data.type || SessionType.WEB,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      lastActivity: now,
      expiresAt,
      rememberUntil,
      isRememberMe: data.isRememberMe || false,
      isSecure: this.isSecureConnection(data.ipAddress),
      isHttpOnly: true,
      isSameSite: true,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      osName: deviceInfo.osName,
      osVersion: deviceInfo.osVersion,
      browserName: deviceInfo.browserName,
      browserVersion: deviceInfo.browserVersion,
      isMobile: deviceInfo.isMobile,
      isTablet: deviceInfo.isTablet,
      isDesktop: deviceInfo.isDesktop,
      lastLoginAt: now,
      metadata: data.metadata,
    });

    const savedSession = await this.sessionRepo.save(session);

    // Update concurrent session count
    await this.updateConcurrentSessionCount(data.userId);

    // Log session creation
    await this.auditService.log({
      eventType: AuditEventType.SESSION_CREATED,
      severity: AuditSeverity.LOW,
      description: 'User session created',
      userId: data.userId,
      resourceType: 'session',
      resourceId: sessionId,
      details: {
        sessionType: data.type || SessionType.WEB,
        isRememberMe: data.isRememberMe || false,
        deviceInfo,
        ipAddress: data.ipAddress,
      },
    });

    this.logger.log(`Session created for user ${data.userId}: ${sessionId}`);
    return savedSession;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessionRepo.findOne({
      where: { sessionId, status: SessionStatus.ACTIVE },
      relations: ['user'],
    });
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(
    sessionId: string,
    ipAddress?: string,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.sessionTimeoutMinutes * 60 * 1000,
    );

    await this.sessionRepo.update(sessionId, {
      lastActivity: now,
      lastRequestAt: now,
      expiresAt,
      requestCount: session.requestCount + 1,
      ipAddress: ipAddress || session.ipAddress,
    });

    // Check for suspicious activity
    await this.checkSuspiciousActivity(session);
  }

  /**
   * Terminate a session
   */
  async terminateSession(
    sessionId: string,
    terminatedBy?: string,
    reason?: string,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return;
    }

    await this.sessionRepo.update(sessionId, {
      status: SessionStatus.TERMINATED,
      terminatedAt: new Date(),
      terminatedBy,
      terminationReason: reason,
    });

    // Update concurrent session count
    await this.updateConcurrentSessionCount(session.userId);

    // Log session termination
    await this.auditService.log({
      eventType: AuditEventType.SESSION_TERMINATED,
      severity: AuditSeverity.MEDIUM,
      description: 'User session terminated',
      userId: session.userId,
      resourceType: 'session',
      resourceId: sessionId,
      details: {
        terminatedBy,
        reason,
        sessionDuration: Date.now() - session.createdAt.getTime(),
      },
    });

    this.logger.log(`Session terminated: ${sessionId}`);
  }

  /**
   * Terminate all sessions for a user
   */
  async terminateAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    terminatedBy?: string,
    reason?: string,
  ): Promise<number> {
    const whereCondition: any = {
      userId,
      status: SessionStatus.ACTIVE,
    };

    if (exceptSessionId) {
      whereCondition.sessionId = { $ne: exceptSessionId };
    }

    const sessions = await this.sessionRepo.find({ where: whereCondition });

    for (const session of sessions) {
      await this.terminateSession(session.sessionId, terminatedBy, reason);
    }

    return sessions.length;
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.sessionRepo.find({
      where: { userId, status: SessionStatus.ACTIVE },
      order: { lastActivity: 'DESC' },
    });

    return sessions.map((session) => this.mapSessionToInfo(session));
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    const expiredSessions = await this.sessionRepo.find({
      where: {
        status: SessionStatus.ACTIVE,
        expiresAt: LessThan(now),
      },
    });

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

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(session: Session): Promise<void> {
    const suspiciousIndicators: string[] = [];

    // Check for rapid requests
    if (session.requestCount > 1000) {
      suspiciousIndicators.push('High request count');
    }

    // Check for unusual IP patterns
    const recentSessions = await this.sessionRepo.find({
      where: {
        userId: session.userId,
        status: SessionStatus.ACTIVE,
        createdAt: MoreThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });

    const uniqueIPs = new Set(
      recentSessions.map((s) => s.ipAddress).filter(Boolean),
    );
    if (uniqueIPs.size > 5) {
      suspiciousIndicators.push('Multiple IP addresses');
    }

    // Check for unusual user agents
    const uniqueUserAgents = new Set(
      recentSessions.map((s) => s.userAgent).filter(Boolean),
    );
    if (uniqueUserAgents.size > 3) {
      suspiciousIndicators.push('Multiple user agents');
    }

    if (suspiciousIndicators.length > 0) {
      await this.sessionRepo.update(session.sessionId, {
        isSuspicious: true,
        suspiciousActivity: {
          indicators: suspiciousIndicators,
          detectedAt: new Date().toISOString(),
          requestCount: session.requestCount,
        } as any,
      });

      // Log suspicious activity
      await this.auditService.log({
        eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
        severity: AuditSeverity.HIGH,
        description: 'Suspicious session activity detected',
        userId: session.userId,
        resourceType: 'session',
        resourceId: session.sessionId,
        details: {
          indicators: suspiciousIndicators,
          sessionData: {
            requestCount: session.requestCount,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          },
        },
      });
    }
  }

  /**
   * Lock a session due to suspicious activity
   */
  async lockSession(
    sessionId: string,
    lockedBy: string,
    reason: string,
  ): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      isLocked: true,
      lockedAt: new Date(),
      lockedBy,
      lockReason: reason,
      status: SessionStatus.SUSPENDED,
    });

    // Log session lock
    await this.auditService.log({
      eventType: AuditEventType.SESSION_LOCKED,
      severity: AuditSeverity.HIGH,
      description: 'Session locked due to suspicious activity',
      userId: (await this.getSession(sessionId))?.userId,
      resourceType: 'session',
      resourceId: sessionId,
      details: { lockedBy, reason },
    });
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalActive: number;
    totalExpired: number;
    totalTerminated: number;
    totalSuspicious: number;
    totalLocked: number;
    averageSessionDuration: number;
    concurrentSessions: number;
  }> {
    const [active, expired, terminated, suspicious, locked] = await Promise.all(
      [
        this.sessionRepo.count({ where: { status: SessionStatus.ACTIVE } }),
        this.sessionRepo.count({ where: { status: SessionStatus.EXPIRED } }),
        this.sessionRepo.count({ where: { status: SessionStatus.TERMINATED } }),
        this.sessionRepo.count({ where: { isSuspicious: true } }),
        this.sessionRepo.count({ where: { isLocked: true } }),
      ],
    );

    const activeSessions = await this.sessionRepo.find({
      where: { status: SessionStatus.ACTIVE },
    });

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

  /**
   * Check concurrent session limit
   */
  private async checkConcurrentSessionLimit(userId: string): Promise<void> {
    const activeSessions = await this.sessionRepo.count({
      where: { userId, status: SessionStatus.ACTIVE },
    });

    if (activeSessions >= this.maxConcurrentSessions) {
      throw new ConflictException(
        `Maximum concurrent sessions limit reached (${this.maxConcurrentSessions})`,
      );
    }
  }

  /**
   * Update concurrent session count
   */
  private async updateConcurrentSessionCount(userId: string): Promise<void> {
    const activeSessions = await this.sessionRepo.find({
      where: { userId, status: SessionStatus.ACTIVE },
    });

    const concurrentCount = activeSessions.length;
    const isConcurrent = concurrentCount > 1;

    await this.sessionRepo.update(
      { userId, status: SessionStatus.ACTIVE },
      {
        concurrentCount,
        isConcurrent,
      },
    );
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Parse user agent for device information
   */
  private parseUserAgent(userAgent: string): any {
    if (!userAgent) {
      return {
        deviceId: crypto.randomBytes(16).toString('hex'),
        isMobile: false,
        isTablet: false,
        isDesktop: true,
      };
    }

    const parser = new (UAParser as any)(userAgent);
    const result = parser.getResult();

    return {
      deviceId: crypto
        .createHash('sha256')
        .update(userAgent)
        .digest('hex')
        .substring(0, 16),
      deviceName: `${result.device.vendor || 'Unknown'} ${result.device.model || 'Device'}`,
      osName: result.os.name,
      osVersion: result.os.version,
      browserName: result.browser.name,
      browserVersion: result.browser.version,
      isMobile: result.device.type === 'mobile',
      isTablet: result.device.type === 'tablet',
      isDesktop: !result.device.type || result.device.type === 'desktop',
    };
  }

  /**
   * Check if connection is secure
   */
  private isSecureConnection(ipAddress?: string): boolean {
    // In production, this would check for HTTPS
    // For now, we'll assume localhost is secure for development
    return ipAddress === '127.0.0.1' || ipAddress === '::1';
  }

  /**
   * Map session to session info
   */
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
