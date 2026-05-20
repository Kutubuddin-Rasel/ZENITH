import { Injectable } from '@nestjs/common';

import { SessionPolicy } from '../../entities/session-policy.entity';
import { SessionPreferencesRepository } from '../../repositories/abstract/session-preferences.repository.abstract';
import { UpdateSessionPreferencesDto } from '../../dto/update-session-preferences.dto';

const SESSION_POLICY_DEFAULTS = {
  sessionTimeoutMinutes: 30,
  maxConcurrentSessions: 5,
  killOldestOnLimit: true,
} as const;

export interface SessionLimits {
  readonly sessionTimeoutMinutes: number;
  readonly maxConcurrentSessions: number;
  readonly killOldestOnLimit: boolean;
}

/**
 * Step 4 — Session-policy half of the former `UserSecuritySettingsService`.
 * Owns only the columns the session enforcement layer consumes.
 *
 * Step 5 — Depends on the abstract `SessionPreferencesRepository`. All
 * TypeORM concerns (including the unique-violation race when two slices race
 * to insert the same row) are encapsulated in the repository.
 */
@Injectable()
export class SessionPreferencesService {
  constructor(
    private readonly preferencesRepository: SessionPreferencesRepository,
  ) {}

  async getOrCreate(userId: string): Promise<SessionPolicy> {
    return this.preferencesRepository.getOrCreate(
      userId,
      SESSION_POLICY_DEFAULTS,
    );
  }

  async update(
    userId: string,
    updates: UpdateSessionPreferencesDto,
  ): Promise<SessionPolicy> {
    const settings = await this.preferencesRepository.getOrCreate(
      userId,
      SESSION_POLICY_DEFAULTS,
    );

    if (updates.sessionTimeoutMinutes !== undefined) {
      settings.sessionTimeoutMinutes = Math.max(
        5,
        Math.min(1440, updates.sessionTimeoutMinutes),
      );
    }
    if (updates.maxConcurrentSessions !== undefined) {
      settings.maxConcurrentSessions = Math.max(
        1,
        Math.min(20, updates.maxConcurrentSessions),
      );
    }
    if (updates.killOldestOnLimit !== undefined) {
      settings.killOldestOnLimit = updates.killOldestOnLimit;
    }

    return this.preferencesRepository.save(settings);
  }

  async getSessionLimits(userId: string): Promise<SessionLimits> {
    const settings = await this.getOrCreate(userId);
    return {
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      maxConcurrentSessions: settings.maxConcurrentSessions,
      killOldestOnLimit: settings.killOldestOnLimit,
    };
  }
}
