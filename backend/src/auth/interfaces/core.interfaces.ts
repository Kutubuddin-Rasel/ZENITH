/**
 * Auth Core ISP Contracts.
 *
 * Foundational interfaces for authentication strategies and account
 * lockout policy. Concrete implementations are bound in `auth.module.ts`
 * via the symbol tokens defined in `../constants/auth.tokens.ts`.
 *
 * @see SOLID_STANDARDS.md — ISP, DIP
 */

import { SafeUser } from '../types/safe-user.interface';

/**
 * The successfully-authenticated identity. Aliased so that downstream
 * authenticators (Local, SAML, future OAuth) yield a uniform principal
 * shape independent of the credential mechanism.
 */
export type AuthPrincipal = SafeUser;

/** Local-credential shape consumed by `LocalStrategy` / `ICredentialValidator`. */
export interface LocalCredentials {
  readonly email: string;
  readonly password: string;
}

/** Ambient request context propagated into authentication for audit/lockout. */
export interface AuthContext {
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Generic authentication contract — one implementation per credential type.
 *
 * @typeParam TCredentials — credential payload (e.g. {@link LocalCredentials},
 *   SAML profile, OAuth token).
 * @typeParam TPrincipal — domain principal returned on success
 *   (defaults to {@link AuthPrincipal}).
 *
 * Implementations MUST throw `UnauthorizedException` on failure rather than
 * returning `null` — null is reserved for credential-validation pre-check.
 */
export interface IAuthenticator<TCredentials, TPrincipal = AuthPrincipal> {
  authenticate(
    credentials: TCredentials,
    context?: AuthContext,
  ): Promise<TPrincipal>;
}

/**
 * Passport-LocalStrategy companion. Returns `null` for "credentials did not
 * match" so the Passport guard can render the canonical 401, separate from
 * service-thrown errors (account locked, password expired, etc).
 */
export interface ICredentialValidator {
  validate(
    credentials: LocalCredentials,
    context?: AuthContext,
  ): Promise<AuthPrincipal | null>;
}

/**
 * Account-lockout policy — gates `validate()` and rate-limits brute force.
 * Backed by a TTL counter (Redis) per `userId`.
 */
export interface IAccountLockoutPolicy {
  /** True when the user has exceeded {@link getMaxAttempts} within the TTL. */
  isLocked(userId: string): Promise<boolean>;
  /** Atomically increment the failure counter; returns the new attempt count. */
  recordFailure(userId: string): Promise<number>;
  /** Reset the failure counter — called on successful authentication. */
  clear(userId: string): Promise<void>;
  /**
   * Admin override — clears the counter and emits an audit event attributing
   * the action to the supplied administrator.
   */
  unlock(userId: string, adminUserId: string): Promise<void>;
  /** Configured failure ceiling before lockout triggers. */
  getMaxAttempts(): number;
  /** Configured lockout TTL in seconds. */
  getLockoutTtlSeconds(): number;
}
