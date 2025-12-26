import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSecuritySettings } from './entities/user-security-settings.entity';

@Injectable()
export class UserSecuritySettingsService {
  constructor(
    @InjectRepository(UserSecuritySettings)
    private readonly settingsRepo: Repository<UserSecuritySettings>,
  ) {}

  /**
   * Get user's security settings (or create default if not exists)
   */
  async getOrCreate(userId: string): Promise<UserSecuritySettings> {
    let settings = await this.settingsRepo.findOne({
      where: { userId },
    });

    if (!settings) {
      // Create with defaults
      settings = this.settingsRepo.create({
        userId,
        sessionTimeoutMinutes: 30,
        maxConcurrentSessions: 5,
        killOldestOnLimit: true,
        notifyOnNewLogin: true,
        notifyOnPasswordChange: true,
        notifyOnSecurityEvent: true,
      });
      await this.settingsRepo.save(settings);
    }

    return settings;
  }

  /**
   * Update user's security settings
   */
  async update(
    userId: string,
    updates: Partial<
      Omit<UserSecuritySettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<UserSecuritySettings> {
    // Get or create settings first
    const settings = await this.getOrCreate(userId);

    // Validate numeric ranges
    if (updates.sessionTimeoutMinutes !== undefined) {
      updates.sessionTimeoutMinutes = Math.max(
        5,
        Math.min(1440, updates.sessionTimeoutMinutes),
      );
    }
    if (updates.maxConcurrentSessions !== undefined) {
      updates.maxConcurrentSessions = Math.max(
        1,
        Math.min(20, updates.maxConcurrentSessions),
      );
    }

    // Apply updates
    Object.assign(settings, updates);
    return this.settingsRepo.save(settings);
  }

  /**
   * Get just the numeric values (for session enforcement)
   */
  async getSessionLimits(userId: string): Promise<{
    sessionTimeoutMinutes: number;
    maxConcurrentSessions: number;
    killOldestOnLimit: boolean;
  }> {
    const settings = await this.getOrCreate(userId);
    return {
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      maxConcurrentSessions: settings.maxConcurrentSessions,
      killOldestOnLimit: settings.killOldestOnLimit,
    };
  }
}
