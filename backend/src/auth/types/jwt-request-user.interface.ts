export interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
  organizationId?: string; // Added for workspace context
  passwordVersion?: number; // Added for session invalidation on password change
  jti?: string; // JWT ID for token blacklist/revocation
}

/**
 * Extended JWT payload with standard claims.
 * This represents the full decoded token including standard JWT claims.
 */
export interface JwtPayload extends JwtRequestUser {
  iat?: number; // Issued at (seconds since epoch)
  exp?: number; // Expiration time (seconds since epoch)
}
