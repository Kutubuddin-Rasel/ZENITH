import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { UserSession } from '../../entities/user-session.entity';
import { UserSessionRepository } from '../abstract/user-session.repository.abstract';

/**
 * Step 2 — Concrete TypeORM implementation of the `UserSessionRepository`
 * DIP token. All TypeORM imports (`@InjectRepository`, `Repository`, `Not`)
 * are confined to this file.
 */
@Injectable()
export class PostgresUserSessionRepository implements UserSessionRepository {
  constructor(
    @InjectRepository(UserSession)
    private readonly repo: Repository<UserSession>,
  ) {}

  create(seed: Partial<UserSession>): UserSession {
    return this.repo.create(seed);
  }

  save(session: UserSession): Promise<UserSession> {
    return this.repo.save(session);
  }

  async touchByTokenHash(tokenHash: string, lastUsedAt: Date): Promise<void> {
    await this.repo.update({ tokenHash }, { lastUsedAt });
  }

  findByTokenHash(tokenHash: string): Promise<UserSession | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  listForUserWithDeviceInfo(userId: string): Promise<UserSession[]> {
    return this.repo.find({
      where: { userId },
      order: { lastUsedAt: 'DESC' },
      select: [
        'id',
        'deviceType',
        'browser',
        'os',
        'ipAddress',
        'location',
        'createdAt',
        'lastUsedAt',
        'tokenHash',
      ],
    });
  }

  async deleteByIdForUser(sessionId: string, userId: string): Promise<number> {
    const result = await this.repo.delete({ id: sessionId, userId });
    return result.affected ?? 0;
  }

  async deleteAllForUserExcept(
    userId: string,
    exceptId: string,
  ): Promise<number> {
    const result = await this.repo.delete({ userId, id: Not(exceptId) });
    return result.affected ?? 0;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const result = await this.repo.delete({ userId });
    return result.affected ?? 0;
  }

  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  countForUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }
}
