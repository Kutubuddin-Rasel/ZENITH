import type { DeepPartial } from 'typeorm';
import type {
  Session,
  SessionStatus,
  SessionType,
} from '../entities/session.entity';

// ============================================================================
// VALUE TYPES (moved out of the legacy SessionService god class)
// ============================================================================

/** Input contract for creating a session. `isSecure` is resolved by the
 * controller via the secure-connection utility, not by the service. */
export interface CreateSessionData {
  userId: string;
  organizationId?: string;
  userAgent?: string;
  ipAddress?: string;
  type?: SessionType;
  isRememberMe?: boolean;
  metadata?: Record<string, unknown>;
  isSecure?: boolean;
}

/** Public, transport-safe projection of a Session (no entity internals). */
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

/** Result of parsing a User-Agent string into device fingerprint fields. */
export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  osName?: string;
  osVersion?: string;
  browserName?: string;
  browserVersion?: string;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

/** Aggregate session statistics (admin dashboard). */
export interface SessionStats {
  totalActive: number;
  totalExpired: number;
  totalTerminated: number;
  totalSuspicious: number;
  totalLocked: number;
  averageSessionDuration: number;
  concurrentSessions: number;
}

/** Structured audit payloads — keeps AuditService concretions out of the
 * application services (DIP). */
export interface SessionCreatedAudit {
  sessionId: string;
  userId: string;
  organizationId?: string;
  sessionType: SessionType;
  isRememberMe: boolean;
  deviceInfo: DeviceInfo;
  ipAddress?: string;
}

export interface SessionTerminatedAudit {
  sessionId: string;
  userId: string;
  terminatedBy?: string;
  reason?: string;
  sessionDurationMs: number;
}

export interface SuspiciousActivityAudit {
  sessionId: string;
  userId: string;
  indicators: string[];
  requestCount: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionLockedAudit {
  sessionId: string;
  userId?: string;
  lockedBy: string;
  reason: string;
}

// ============================================================================
// INFRASTRUCTURE PORTS (abstract classes = injection contracts, per
// SOLID_STANDARDS DIP recipe)
// ============================================================================

/**
 * Persistence port over the Session table — the single DIP seam that isolates
 * TypeORM (`Repository<Session>`) from the application services.
 */
export abstract class ISessionStore {
  /** Persist a new session (create + save). */
  abstract persist(data: DeepPartial<Session>): Promise<Session>;
  /** Active session by its sessionId, with the `user` relation loaded. */
  abstract findActiveById(sessionId: string): Promise<Session | null>;
  /** Session by sessionId regardless of status (used before status changes). */
  abstract findById(sessionId: string): Promise<Session | null>;
  /** Patch a session identified by its sessionId. */
  abstract updateBySessionId(
    sessionId: string,
    patch: Partial<Session>,
  ): Promise<void>;
  /** Patch every ACTIVE session belonging to a user. */
  abstract updateActiveByUser(
    userId: string,
    patch: Partial<Session>,
  ): Promise<void>;
  /** Active sessions for a user (newest activity first), optionally excluding
   * one sessionId. */
  abstract findActiveByUser(
    userId: string,
    exceptSessionId?: string,
  ): Promise<Session[]>;
  /** All ACTIVE sessions (stats aggregation). */
  abstract findAllActive(): Promise<Session[]>;
  /** ACTIVE sessions whose expiry is before `now`. */
  abstract findExpiredActive(now: Date): Promise<Session[]>;
  /** ACTIVE sessions for a user created after `since` (anomaly detection). */
  abstract findRecentActiveByUser(
    userId: string,
    since: Date,
  ): Promise<Session[]>;
  abstract countByStatus(status: SessionStatus): Promise<number>;
  abstract countActiveByUser(userId: string): Promise<number>;
  abstract countSuspicious(): Promise<number>;
  abstract countLocked(): Promise<number>;
}

/** Existence check against the User table (replaces the `Repository<User>`
 * injection inside the session module). */
export abstract class ISessionUserLookup {
  abstract userExists(userId: string): Promise<boolean>;
}

/** Strongly-typed session configuration (isolates `ConfigService` reads). */
export abstract class ISessionConfig {
  abstract readonly maxConcurrentSessions: number;
  abstract readonly sessionTimeoutMinutes: number;
  abstract readonly rememberMeDays: number;
}

/** Audit adapter — wraps `AuditService` behind intent-named methods. */
export abstract class ISessionAuditor {
  abstract sessionCreated(event: SessionCreatedAudit): Promise<void>;
  abstract sessionTerminated(event: SessionTerminatedAudit): Promise<void>;
  abstract suspiciousActivity(event: SuspiciousActivityAudit): Promise<void>;
  abstract sessionLocked(event: SessionLockedAudit): Promise<void>;
}

/** Pure device-fingerprinting / id-generation utilities. */
export abstract class ISessionDeviceParser {
  abstract parseUserAgent(userAgent: string): DeviceInfo;
  abstract generateSessionId(): string;
}

// ============================================================================
// APPLICATION PORTS (role-segregated per ISP)
// ============================================================================

/** Read side. */
export abstract class ISessionQuery {
  abstract getSession(sessionId: string): Promise<Session | null>;
  abstract getUserSessions(userId: string): Promise<SessionInfo[]>;
  abstract getSessionStats(): Promise<SessionStats>;
}

/** Creation + activity tracking. */
export abstract class ISessionCommand {
  abstract createSession(data: CreateSessionData): Promise<Session>;
  abstract updateSessionActivity(
    sessionId: string,
    ipAddress?: string,
  ): Promise<void>;
}

/** Termination + cleanup. */
export abstract class ISessionLifecycle {
  abstract terminateSession(
    sessionId: string,
    terminatedBy?: string,
    reason?: string,
  ): Promise<void>;
  abstract terminateAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    terminatedBy?: string,
    reason?: string,
  ): Promise<number>;
  abstract cleanupExpiredSessions(): Promise<number>;
}

/** Suspicious-activity detection, locking, and concurrency enforcement. */
export abstract class ISessionSecurity {
  abstract checkSuspiciousActivity(session: Session): Promise<void>;
  abstract lockSession(
    sessionId: string,
    lockedBy: string,
    reason: string,
  ): Promise<void>;
  abstract checkConcurrentSessionLimit(userId: string): Promise<void>;
  abstract updateConcurrentSessionCount(userId: string): Promise<void>;
}
