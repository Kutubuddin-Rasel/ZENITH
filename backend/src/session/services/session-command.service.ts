import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Session,
  SessionStatus,
  SessionType,
} from '../entities/session.entity';
import {
  SESSION_AUDITOR_TOKEN,
  SESSION_CONFIG_TOKEN,
  SESSION_DEVICE_PARSER_TOKEN,
  SESSION_SECURITY_TOKEN,
  SESSION_STORE_TOKEN,
  SESSION_USER_LOOKUP_TOKEN,
} from '../constants/session.tokens';
import {
  CreateSessionData,
  ISessionAuditor,
  ISessionCommand,
  ISessionConfig,
  ISessionDeviceParser,
  ISessionSecurity,
  ISessionStore,
  ISessionUserLookup,
} from '../interfaces/session.interfaces';

/**
 * {@link ISessionCommand} — session creation and activity tracking. Composes
 * the user-lookup, device-parser, security, config, store and auditor ports.
 */
@Injectable()
export class SessionCommandService extends ISessionCommand {
  private readonly logger = new Logger(SessionCommandService.name);

  constructor(
    @Inject(SESSION_STORE_TOKEN) private readonly store: ISessionStore,
    @Inject(SESSION_USER_LOOKUP_TOKEN)
    private readonly userLookup: ISessionUserLookup,
    @Inject(SESSION_DEVICE_PARSER_TOKEN)
    private readonly deviceParser: ISessionDeviceParser,
    @Inject(SESSION_SECURITY_TOKEN) private readonly security: ISessionSecurity,
    @Inject(SESSION_CONFIG_TOKEN) private readonly config: ISessionConfig,
    @Inject(SESSION_AUDITOR_TOKEN) private readonly auditor: ISessionAuditor,
  ) {
    super();
  }

  async createSession(data: CreateSessionData): Promise<Session> {
    const exists = await this.userLookup.userExists(data.userId);
    if (!exists) {
      throw new UnauthorizedException('User not found');
    }

    await this.security.checkConcurrentSessionLimit(data.userId);

    const deviceInfo = this.deviceParser.parseUserAgent(data.userAgent || '');
    const sessionId = this.deviceParser.generateSessionId();

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.sessionTimeoutMinutes * 60 * 1000,
    );
    const rememberUntil = data.isRememberMe
      ? new Date(
          now.getTime() + this.config.rememberMeDays * 24 * 60 * 60 * 1000,
        )
      : null;

    const savedSession = await this.store.persist({
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
      isSecure: data.isSecure ?? false,
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

    await this.security.updateConcurrentSessionCount(data.userId);

    await this.auditor.sessionCreated({
      sessionId,
      userId: data.userId,
      organizationId: data.organizationId,
      sessionType: data.type || SessionType.WEB,
      isRememberMe: data.isRememberMe || false,
      deviceInfo,
      ipAddress: data.ipAddress,
    });

    this.logger.log(`Session created for user ${data.userId}: ${sessionId}`);
    return savedSession;
  }

  async updateSessionActivity(
    sessionId: string,
    ipAddress?: string,
  ): Promise<void> {
    const session = await this.store.findActiveById(sessionId);
    if (!session) {
      return;
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.sessionTimeoutMinutes * 60 * 1000,
    );

    await this.store.updateBySessionId(sessionId, {
      lastActivity: now,
      lastRequestAt: now,
      expiresAt,
      requestCount: session.requestCount + 1,
      ipAddress: ipAddress || session.ipAddress,
    });

    await this.security.checkSuspiciousActivity(session);
  }
}
