import { Injectable } from '@nestjs/common';

import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationPreferencesRepository } from '../repositories/abstract/notification-preferences.repository.abstract';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';

const NOTIFICATION_DEFAULTS = {
  notifyOnNewLogin: true,
  notifyOnPasswordChange: true,
  notifyOnSecurityEvent: true,
} as const;

/**
 * Step 4 — Notification-preference half of the former
 * `UserSecuritySettingsService`. Owns the email opt-in flags only; the
 * session-policy half lives in `auth/services/users/session-preferences.service.ts`.
 *
 * Step 5 — Depends on the abstract `NotificationPreferencesRepository`. All
 * TypeORM concerns (including the unique-violation race when two slices race
 * to insert the same row) are encapsulated in the repository.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly preferencesRepository: NotificationPreferencesRepository,
  ) {}

  async getOrCreate(userId: string): Promise<NotificationPreference> {
    return this.preferencesRepository.getOrCreate(
      userId,
      NOTIFICATION_DEFAULTS,
    );
  }

  async update(
    userId: string,
    updates: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    const settings = await this.preferencesRepository.getOrCreate(
      userId,
      NOTIFICATION_DEFAULTS,
    );

    if (updates.notifyOnNewLogin !== undefined) {
      settings.notifyOnNewLogin = updates.notifyOnNewLogin;
    }
    if (updates.notifyOnPasswordChange !== undefined) {
      settings.notifyOnPasswordChange = updates.notifyOnPasswordChange;
    }
    if (updates.notifyOnSecurityEvent !== undefined) {
      settings.notifyOnSecurityEvent = updates.notifyOnSecurityEvent;
    }

    return this.preferencesRepository.save(settings);
  }
}
