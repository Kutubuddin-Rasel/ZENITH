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
  ) {}

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
}
