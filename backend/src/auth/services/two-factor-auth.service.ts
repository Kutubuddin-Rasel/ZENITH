import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { TwoFactorAuth } from '../entities/two-factor-auth.entity';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class TwoFactorAuthService {
  constructor(
    @InjectRepository(TwoFactorAuth)
    private twoFactorRepo: Repository<TwoFactorAuth>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) { }

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

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Save or update 2FA record
    const twoFactorAuth = existing2FA || this.twoFactorRepo.create({ userId });
    twoFactorAuth.secret = secret.base32;
    twoFactorAuth.backupCodes = JSON.stringify(backupCodes);
    twoFactorAuth.isEnabled = false;

    await this.twoFactorRepo.save(twoFactorAuth);

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
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

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time windows for clock drift
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Enable 2FA
    twoFactorAuth.isEnabled = true;
    await this.twoFactorRepo.save(twoFactorAuth);

    const backupCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];

    return {
      success: true,
      backupCodes,
    };
  }

  /**
   * Verify TOTP token for login
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId, isEnabled: true },
    });
    if (!twoFactorAuth) {
      return false;
    }

    // Check if it's a backup code
    const backupCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];
    if (backupCodes.includes(token)) {
      // Remove used backup code
      const updatedBackupCodes: string[] = backupCodes.filter(
        (code) => code !== token,
      );
      twoFactorAuth.backupCodes = JSON.stringify(updatedBackupCodes);
      twoFactorAuth.lastUsedAt = new Date();
      await this.twoFactorRepo.save(twoFactorAuth);
      return true;
    }

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (verified) {
      twoFactorAuth.lastUsedAt = new Date();
      await this.twoFactorRepo.save(twoFactorAuth);
    }

    return verified;
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
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId, isEnabled: true },
    });
    if (!twoFactorAuth) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    const backupCodes = this.generateBackupCodes();
    twoFactorAuth.backupCodes = JSON.stringify(backupCodes);
    await this.twoFactorRepo.save(twoFactorAuth);

    return backupCodes;
  }

  /**
   * Generate 10 backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(this.generateRandomCode());
    }
    return codes;
  }

  /**
   * Generate random backup code
   */
  private generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
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

    // Log the admin action (the controller should also log to AuditLogs)
    console.log(
      `[SECURITY] Admin ${adminUserId} reset 2FA for user ${targetUserId}. Reason: ${reason || 'Not specified'}`,
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
    lastUsedAt: Date | null;
  }> {
    const twoFactorAuth = await this.twoFactorRepo.findOne({
      where: { userId },
    });

    if (!twoFactorAuth) {
      return {
        isEnabled: false,
        hasBackupCodes: false,
        lastUsedAt: null,
      };
    }

    const backupCodes = JSON.parse(
      twoFactorAuth.backupCodes ?? '[]',
    ) as string[];

    return {
      isEnabled: twoFactorAuth.isEnabled,
      hasBackupCodes: backupCodes.length > 0,
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
        message: 'If an account exists with this email and has 2FA enabled, a recovery link has been sent.',
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
        message: 'If an account exists with this email and has 2FA enabled, a recovery link has been sent.',
      };
    }

    // Generate a secure random token
    const token = this.generateSecureToken();

    // Hash the token before storing (like password)
    const crypto = await import('crypto');
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Set token expiry to 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Save to database
    twoFactorAuth.recoveryToken = hashedToken;
    twoFactorAuth.recoveryTokenExpiresAt = expiresAt;
    await this.twoFactorRepo.save(twoFactorAuth);

    console.log(
      `[SECURITY] 2FA recovery token generated for user ${user.id} (${email})`,
    );

    return {
      success: true,
      message: 'If an account exists with this email and has 2FA enabled, a recovery link has been sent.',
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
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    if (hashedToken !== twoFactorAuth.recoveryToken) {
      throw new UnauthorizedException('Invalid or expired recovery link');
    }

    // Token is valid - disable 2FA and clear recovery token
    await this.twoFactorRepo.remove(twoFactorAuth);

    console.log(
      `[SECURITY] 2FA recovery completed for user ${user.id} (${email}) - 2FA disabled`,
    );

    return {
      success: true,
      message: 'Two-factor authentication has been disabled. You can now log in with just your password.',
      userId: user.id,
    };
  }

  /**
   * Generate a secure random token for recovery
   */
  private generateSecureToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

