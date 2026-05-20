import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { SessionPolicy } from '../../entities/session-policy.entity';
import {
  SessionPolicyDefaults,
  SessionPreferencesRepository,
} from '../abstract/session-preferences.repository.abstract';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Step 5 — Concrete TypeORM implementation of the
 * `SessionPreferencesRepository` DIP token. All TypeORM imports
 * (`@InjectRepository`, `Repository`, `QueryFailedError`) are confined to
 * this file.
 */
@Injectable()
export class PostgresSessionPreferencesRepository implements SessionPreferencesRepository {
  constructor(
    @InjectRepository(SessionPolicy)
    private readonly repo: Repository<SessionPolicy>,
  ) {}

  async findByUserId(userId: string): Promise<SessionPolicy | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async getOrCreate(
    userId: string,
    defaults: SessionPolicyDefaults,
  ): Promise<SessionPolicy> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    const draft = this.repo.create({
      userId,
      sessionTimeoutMinutes: defaults.sessionTimeoutMinutes,
      maxConcurrentSessions: defaults.maxConcurrentSessions,
      killOldestOnLimit: defaults.killOldestOnLimit,
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

  async save(entity: SessionPolicy): Promise<SessionPolicy> {
    return this.repo.save(entity);
  }
}
