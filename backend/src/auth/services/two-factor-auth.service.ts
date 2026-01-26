import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as argon2 from 'argon2';
import { TwoFactorAuth } from '../entities/two-factor-auth.entity';
import { User } from '../../users/entities/user.entity';
import { AuditService } from '../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { AuthConfig } from '../../config/auth.config';

@Injectable()
export class TwoFactorAuthService {
  private readonly logger = new Logger(TwoFactorAuthService.name);
  private readonly totpWindow: number;
  private readonly recoveryCodeCount: number;

  constructor(
    @InjectRepository(TwoFactorAuth)
    private twoFactorRepo: Repository<TwoFactorAuth>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    // Load TOTP configuration from typed auth config
    const authConfig = this.configService.get<AuthConfig>('auth');
    this.totpWindow = authConfig?.twoFactor.totpWindow ?? 1;
    this.recoveryCodeCount = authConfig?.twoFactor.recoveryCodeCount ?? 10; // Standard: 10 codes
  }

  /**
   * Generate TOTP secret and QR code for user
   */
  async generateSecret(
    userId: string,
    userEmail: string,
  ): Promise<{
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  }> {
    // Check if user already has 2FA enabled
    const existing2FA = await this.twoFactorRepo.findOne({ where: { userId } });
    if (existing2FA?.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `Zenith PM (${userEmail})`,
      issuer: 'Zenith Project Management',
      length: 32,
    });

    // Generate backup codes and their hashes
    const { plaintextCodes, hashedCodes } = await this.generateBackupCodes();

    // Save or update 2FA record (store ONLY hashed codes)
    const twoFactorAuth = existing2FA || this.twoFactorRepo.create({ userId });
    twoFactorAuth.secret = secret.base32;
    twoFactorAuth.backupCodes = JSON.stringify(hashedCodes); // Store hashed codes only
    twoFactorAuth.isEnabled = false;

    await this.twoFactorRepo.save(twoFactorAuth);

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Return plaintext codes to user - SHOWN ONCE, NEVER RETRIEVABLE AGAIN
    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes: plaintextCodes,
    };
  }

  /**
   * Verify TOTP token and enable 2FA
   */
  async verifyAndEnable(
    userId: string,
    token: string,
  ): Promise<{ success: boolean; backupCodes: string[] }> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId },
    });
    if (!twoFactorAuth) {
      throw new BadRequestException(
        'Two-factor authentication not initialized',
      );
    }

    if (twoFactorAuth.isEnabled) {
      throw new BadRequestException(
        'Two-factor authentication is already enabled',
      );
    }

    // Verify TOTP token with configurable window
    const verified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: this.totpWindow, // Configurable window for clock drift
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Enable 2FA
    twoFactorAuth.isEnabled = true;
    await this.twoFactorRepo.save(twoFactorAuth);

    // NOTE: Cannot return plaintext backup codes here - they are already hashed
    // User should have saved them when they were first generated
    // Return empty array to indicate codes exist but cannot be retrieved
    return {
      success: true,
      backupCodes: [], // Hashed codes cannot be shown again
    };
  }

  /**
   * Verify TOTP token or backup code for login
   * Uses Promise.any() for O(n) constant-time comparison against hashed backup codes
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId, isEnabled: true },
    });
    if (!twoFactorAuth) {
      return false;
    }

    // First, try TOTP verification (fast path)
    const totpVerified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: this.totpWindow,
    });

    if (totpVerified) {
      twoFactorAuth.lastUsedAt = new Date();
      await this.twoFactorRepo.save(twoFactorAuth);
      return true;
    }

    // If TOTP fails, check if it's a backup code (hashed comparison)
    const hashedCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];

    if (hashedCodes.length === 0) {
      return false;
    }

    // Use Promise.any() for O(n) constant-time comparison
    // Each argon2.verify takes constant time regardless of match
    try {
      const matchedHash = await Promise.any(
        hashedCodes.map(async (hash) => {
          const matches = await argon2.verify(hash, token);
          if (matches) {
            return hash; // Return the matched hash for removal
          }
          throw new Error('No match'); // Reject to continue checking
        }),
      );

      // Backup code matched - remove the used hash
      const updatedHashes = hashedCodes.filter((h) => h !== matchedHash);
      twoFactorAuth.backupCodes = JSON.stringify(updatedHashes);
      twoFactorAuth.lastUsedAt = new Date();
      await this.twoFactorRepo.save(twoFactorAuth);

      this.logger.log(
        `Backup code used for user ${userId}. Remaining: ${updatedHashes.length}`,
      );
      return true;
    } catch (error) {
      // AggregateError means all promises rejected (no match found)
      if (error instanceof AggregateError) {
        return false;
      }
      // Unexpected error - log and reject
      this.logger.error(`Error verifying backup code: ${error}`);
      return false;
    }
  }

  /**
   * Disable 2FA for user
   */
  async disable(userId: string): Promise<boolean> {
    // Password verification should be handled at the controller level
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId },
    });
    if (!twoFactorAuth) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    await this.twoFactorRepo.remove(twoFactorAuth);
    return true;
  }

  /**
   * Check if user has 2FA enabled
   */
  async isEnabled(userId: string): Promise<boolean> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId, isEnabled: true },
    });
    return !!twoFactorAuth;
  }

  /**
   * Generate new backup codes (regeneration)
   * Returns plaintext codes once - they will be hashed before storage
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId, isEnabled: true },
    });
    if (!twoFactorAuth) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    // Generate new codes and hashes
    const { plaintextCodes, hashedCodes } = await this.generateBackupCodes();

    // Store only hashes
    twoFactorAuth.backupCodes = JSON.stringify(hashedCodes);
    await this.twoFactorRepo.save(twoFactorAuth);

    this.logger.log(`Backup codes regenerated for user ${userId}`);

    // Return plaintext codes - SHOWN ONCE, NEVER RETRIEVABLE AGAIN
    return plaintextCodes;
  }

  /**
   * Generate 10 backup codes with their Argon2id hashes
   * Returns both plaintext (for user) and hashed (for storage) versions
   */
  private async generateBackupCodes(): Promise<{
    plaintextCodes: string[];
    hashedCodes: string[];
  }> {
    const plaintextCodes: string[] = [];
    const hashPromises: Promise<string>[] = [];

    for (let i = 0; i < this.recoveryCodeCount; i++) {
      const code = this.generateRandomCode();
      plaintextCodes.push(code);

      // Hash each code with Argon2id
      hashPromises.push(
        argon2.hash(code, {
          type: argon2.argon2id,
          memoryCost: 65536, // 64 MB
          timeCost: 3,
          parallelism: 4,
        }),
      );
    }

    const hashedCodes = await Promise.all(hashPromises);

    return { plaintextCodes, hashedCodes };
  }

  /**
   * Generate cryptographically secure random backup code
   * Format: 8-character alphanumeric (e.g., "A1B2C3D4")
   */
  private generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      // crypto.randomInt is cryptographically secure
      result += chars.charAt(randomInt(chars.length));
    }
    return result;
  }

  /**
   * Admin reset 2FA for a user (for locked-out users)
   * Only callable by Super Admins
   * @param targetUserId - The user whose 2FA needs to be reset
   * @param adminUserId - The admin performing the action (for audit)
   * @param reason - Reason for the reset (for audit)
   */
  async adminReset(
    targetUserId: string,
    adminUserId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId: targetUserId },
    });

    if (!twoFactorAuth) {
      return {
        success: false,
        message: 'User does not have 2FA configured',
      };
    }

    // Delete the 2FA record completely
    await this.twoFactorRepo.remove(twoFactorAuth);

    // Log the admin action to audit trail
    await this.auditService.logSecurityEvent(
      AuditEventType.TWO_FA_DISABLED,
      `Admin reset 2FA for user`,
      targetUserId,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        adminUserId,
        targetUserId,
        reason: reason || 'Not specified',
        action: 'admin_reset',
      },
      AuditSeverity.HIGH,
    );

    return {
      success: true,
      message: 'Two-factor authentication has been disabled for this user',
    };
  }

  /**
   * Check 2FA status for a user (admin view)
   */
  async getStatusForUser(userId: string): Promise<{
    isEnabled: boolean;
    hasBackupCodes: boolean;
    backupCodeCount: number;
    lastUsedAt: Date | null;
  }> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId },
    });

    if (!twoFactorAuth) {
      return {
        isEnabled: false,
        hasBackupCodes: false,
        backupCodeCount: 0,
        lastUsedAt: null,
      };
    }

    const hashedCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];

    return {
      isEnabled: twoFactorAuth.isEnabled,
      hasBackupCodes: hashedCodes.length > 0,
      backupCodeCount: hashedCodes.length,
      lastUsedAt: twoFactorAuth.lastUsedAt,
    };
  }

  // ============ EMAIL RECOVERY METHODS ============

  /**
   * Generate a recovery token for email-based 2FA bypass
   * Called when user clicks "Lost access to authenticator?"
   * @returns The unhashed token to send via email (one-time use)
   */
  async generateRecoveryToken(email: string): Promise<{
    success: boolean;
    message: string;
    token?: string; // Only returned for sending via email, never exposed to client
    userId?: string;
  }> {
    // Find user by email
    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      return {
        success: true,
        message:
          'If an account exists with this email and has 2FA enabled, a recovery link has been sent.',
      };
    }

    // Check if user has 2FA enabled
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId: user.id, isEnabled: true },
    });

    if (!twoFactorAuth) {
      // No 2FA enabled, nothing to recover
      return {
        success: true,
        message:
          'If an account exists with this email and has 2FA enabled, a recovery link has been sent.',
      };
    }

    // Generate a secure random token
    const token = this.generateSecureToken();

    // Hash the token before storing (like password)
    const crypto = await import('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Set token expiry to 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Save to database
    twoFactorAuth.recoveryToken = hashedToken;
    twoFactorAuth.recoveryTokenExpiresAt = expiresAt;
    await this.twoFactorRepo.save(twoFactorAuth);

    // Log the security event to audit trail
    await this.auditService.logSecurityEvent(
      AuditEventType.PASSWORD_RESET,
      `2FA recovery token generated`,
      user.id,
      email,
      user.name,
      undefined,
      undefined,
      { action: 'two_fa_recovery_token_generated' },
      AuditSeverity.MEDIUM,
    );

    return {
      success: true,
      message:
        'If an account exists with this email and has 2FA enabled, a recovery link has been sent.',
      token, // This will be sent via email
      userId: user.id,
    };
  }

  /**
   * Verify recovery token and disable 2FA
   * Called when user clicks the recovery link from email
   */
  async verifyRecoveryToken(
    email: string,
    token: string,
  ): Promise<{
    success: boolean;
    message: string;
    userId?: string;
  }> {
    // Find user by email
    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId: user.id },
    });

    if (!twoFactorAuth || !twoFactorAuth.recoveryToken) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    // Check if token is expired
    if (
      twoFactorAuth.recoveryTokenExpiresAt &&
      twoFactorAuth.recoveryTokenExpiresAt < new Date()
    ) {
      // Clear expired token
      twoFactorAuth.recoveryToken = null;
      twoFactorAuth.recoveryTokenExpiresAt = null;
      await this.twoFactorRepo.save(twoFactorAuth);
      throw new UnauthorizedException('Recovery link has expired');
    }

    // Hash the provided token and compare
    const crypto = await import('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    if (hashedToken !== twoFactorAuth.recoveryToken) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    // Token is valid - disable 2FA and clear recovery token
    await this.twoFactorRepo.remove(twoFactorAuth);

    // Log the security event to audit trail
    await this.auditService.logSecurityEvent(
      AuditEventType.TWO_FA_DISABLED,
      `2FA disabled via recovery`,
      user.id,
      email,
      undefined,
      undefined,
      undefined,
      { action: 'recovery_completed' },
      AuditSeverity.HIGH,
    );

    return {
      success: true,
      message:
        'Two-factor authentication has been disabled. You can now log in with just your password.',
      userId: user.id,
    };
  }

  /**
   * Generate a cryptographically secure random token for recovery
   */
  private generateSecureToken(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
      // crypto.randomInt is cryptographically secure
      result += chars.charAt(randomInt(chars.length));
    }
    return result;
  }
}
