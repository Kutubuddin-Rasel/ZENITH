import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LoginHistory } from '../../login-history/entities/login-history.entity';
import {
  LoginHistoryEntry,
  LoginHistoryRepository,
  NewLoginAttempt,
} from '../abstract/login-history.repository.abstract';

/**
 * Step 5 — Concrete TypeORM implementation of the `LoginHistoryRepository`
 * DIP token. All TypeORM imports (`@InjectRepository`, `Repository`) are
 * confined to this file.
 */
@Injectable()
export class PostgresLoginHistoryRepository implements LoginHistoryRepository {
  constructor(
    @InjectRepository(LoginHistory)
    private readonly repo: Repository<LoginHistory>,
  ) {}

  async insertAttempt(attempt: NewLoginAttempt): Promise<void> {
    const entry = this.repo.create({
      userId: attempt.userId,
      ipAddress: attempt.ipAddress,
      userAgent: attempt.userAgent,
      deviceFingerprint: attempt.deviceFingerprint,
      success: attempt.success,
      failureReason: attempt.failureReason,
      organizationId: attempt.organizationId,
    });
    await this.repo.save(entry);
  }

  async findRecentForUser(
    userId: string,
    limit: number,
  ): Promise<ReadonlyArray<LoginHistoryEntry>> {
    const entries = await this.repo.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
      select: [
        'ipAddress',
        'userAgent',
        'deviceFingerprint',
        'timestamp',
        'success',
        'failureReason',
      ],
    });
    return entries;
  }
}
