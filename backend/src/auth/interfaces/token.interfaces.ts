/**
 * Auth Token ISP Contracts.
 *
 * Segregates the three orthogonal concerns of the legacy `AuthService`
 * JWT block: **issuance**, **verification**, and **revocation**. Each
 * contract is bound separately so consumers depend only on what they call.
 *
 * @see SOLID_STANDARDS.md — ISP
 */

import { AuthPrincipal } from './core.interfaces';

/** Standard access+refresh pair returned by login / refresh endpoints. */
export interface TokenPair {
  readonly access_token: string;
  readonly refresh_token: string;
}

/**
 * Claims carried inside the access / refresh JWT. Mirrors the runtime
 * `JwtRequestUser` shape but is owned by the interface layer so concrete
 * verifiers can return it without leaking the legacy type.
 */
export interface AccessTokenClaims {
  readonly userId: string;
  readonly email: string;
  readonly isSuperAdmin: boolean;
  readonly name: string;
  readonly organizationId?: string;
  readonly passwordVersion?: number;
  readonly jti?: string;
  readonly iat?: number;
  readonly exp?: number;
}

/** Decoded payload of the short-lived 2FA-step token (5-min TTL). */
export interface TwoFactorSessionClaims {
  readonly userId: string;
  readonly email: string;
  readonly purpose: '2fa_verification';
  readonly iat?: number;
  readonly exp?: number;
}

/**
 * Mints all JWT material. Owns secret loading, expiry resolution, and JTI
 * generation. No verification or revocation logic.
 */
export interface ITokenIssuer {
  /** Issue access+refresh for an authenticated principal. */
  issuePair(principal: AuthPrincipal): Promise<TokenPair>;
  /**
   * Issue a short-lived signed token that cryptographically binds a 2FA
   * verification step to the original login attempt.
   */
  issueTwoFactorSession(userId: string, email: string): Promise<string>;
}

/**
 * Decodes and validates JWT signatures + expiry. Implementations MUST throw
 * `UnauthorizedException` on any failure mode (signature, expiry, malformed).
 */
export interface ITokenVerifier {
  verifyAccess(token: string): Promise<AccessTokenClaims>;
  verifyRefresh(token: string): Promise<AccessTokenClaims>;
  verifyTwoFactorSession(token: string): Promise<TwoFactorSessionClaims>;
}

/**
 * Server-side denylist for not-yet-expired JTIs. Backed by Redis with TTL
 * matching the remaining token lifetime so memory cleans up automatically.
 */
export interface ITokenRevoker {
  /** Mark a JTI as revoked until its natural expiry (epoch seconds). */
  revoke(jti: string, expiresAtEpochSeconds: number): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
}
