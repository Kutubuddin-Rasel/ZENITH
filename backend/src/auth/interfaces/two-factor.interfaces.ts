/**
 * Two-Factor Authentication ISP Contracts.
 *
 * Splits the legacy 559-LOC `TwoFactorAuthService` into five focused
 * services: TOTP enrolment, verification, backup-code regeneration,
 * email-recovery flow, and admin override. Every public surface is a
 * separate interface so consumers never inherit irrelevant capabilities.
 *
 * @see SOLID_STANDARDS.md — SRP, ISP
 */

/** Output of `I2FASecretStore.enroll` — shown to the user exactly once. */
export interface TwoFactorEnrollmentSecret {
  readonly secret: string;
  readonly qrCodeUrl: string;
  /** Plaintext backup codes — NEVER persisted, only hashes are stored. */
  readonly backupCodes: ReadonlyArray<string>;
}

/** Result of confirming the TOTP code and flipping the enabled bit. */
export interface TwoFactorEnableResult {
  readonly success: boolean;
  /** Always empty after enable — codes were revealed during `enroll`. */
  readonly backupCodes: ReadonlyArray<string>;
}

/** Admin-view summary of a user's 2FA configuration. */
export interface TwoFactorStatus {
  readonly isEnabled: boolean;
  readonly hasBackupCodes: boolean;
  readonly backupCodeCount: number;
  readonly lastUsedAt: Date | null;
}

/** Outcome of `I2FARecoveryService.issueRecoveryToken`. */
export interface RecoveryTokenIssued {
  readonly success: boolean;
  readonly message: string;
  /** Plaintext token — present ONLY when emitted for email delivery. */
  readonly token?: string;
  readonly userId?: string;
}

/** Outcome of redeeming a recovery token. */
export interface RecoveryVerificationResult {
  readonly success: boolean;
  readonly message: string;
  readonly userId?: string;
}

/** Outcome of `I2FAAdminService.reset`. */
export interface AdminResetResult {
  readonly success: boolean;
  readonly message: string;
}

/**
 * Enrolment lifecycle — secret generation, opt-in verification, opt-out.
 * Owns the `TwoFactorAuth` row from creation through disable.
 */
export interface I2FASecretStore {
  enroll(userId: string, userEmail: string): Promise<TwoFactorEnrollmentSecret>;
  verifyAndEnable(
    userId: string,
    token: string,
  ): Promise<TwoFactorEnableResult>;
  disable(userId: string): Promise<boolean>;
  isEnabled(userId: string): Promise<boolean>;
}

/**
 * Per-login TOTP / backup-code verification. Pure read + match — no mutation
 * of the secret itself (backup-code consumption is implementation detail).
 */
export interface I2FAVerifier {
  verify(userId: string, token: string): Promise<boolean>;
}

/** Out-of-band backup-code rotation. Existing codes are invalidated. */
export interface I2FABackupCodeService {
  regenerate(userId: string): Promise<ReadonlyArray<string>>;
}

/**
 * Email-based recovery flow for users who lost their authenticator app.
 * Issues a hashed, single-use, 15-minute token; redemption disables 2FA.
 */
export interface I2FARecoveryService {
  issueRecoveryToken(email: string): Promise<RecoveryTokenIssued>;
  redeemRecoveryToken(
    email: string,
    token: string,
  ): Promise<RecoveryVerificationResult>;
}

/**
 * Super-admin operations — emergency reset for locked-out users.
 * Distinct interface so non-admin call-sites can never inject it.
 */
export interface I2FAAdminService {
  reset(
    targetUserId: string,
    adminUserId: string,
    reason?: string,
  ): Promise<AdminResetResult>;
  getStatusFor(userId: string): Promise<TwoFactorStatus>;
}
