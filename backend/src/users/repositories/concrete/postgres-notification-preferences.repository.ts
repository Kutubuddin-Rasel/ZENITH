import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { NotificationPreference } from '../../entities/notification-preference.entity';
import {
  NotificationPreferenceDefaults,
  NotificationPreferencesRepository,
} from '../abstract/notification-preferences.repository.abstract';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Step 5 — Concrete TypeORM implementation of the
 * `NotificationPreferencesRepository` DIP token. All TypeORM imports
 * (`@InjectRepository`, `Repository`, `QueryFailedError`) are confined to
 * this file.
 */
@Injectable()
export class PostgresNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly repo: Repository<NotificationPreference>,
  ) {}

  async findByUserId(userId: string): Promise<NotificationPreference | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async getOrCreate(
    userId: string,
    defaults: NotificationPreferenceDefaults,
  ): Promise<NotificationPreference> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    const draft = this.repo.create({
      userId,
      notifyOnNewLogin: defaults.notifyOnNewLogin,
      notifyOnPasswordChange: defaults.notifyOnPasswordChange,
      notifyOnSecurityEvent: defaults.notifyOnSecurityEvent,
    });

    try {
      return await this.repo.save(draft);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code?: string }).code ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        const racedRow = await this.repo.findOne({ where: { userId } });
        if (racedRow) {
          return racedRow;
        }
      }
      throw err;
    }
  }

  async save(entity: NotificationPreference): Promise<NotificationPreference> {
    return this.repo.save(entity);
  }
}
