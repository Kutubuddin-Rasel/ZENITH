import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindOptionsWhere,
  LessThan,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { Session, SessionStatus } from '../../entities/session.entity';
import { ISessionStore } from '../abstract/session-store.repository';

/**
 * TypeORM-backed implementation of {@link ISessionStore} — the sole DIP seam
 * isolating `Repository<Session>` from the application services.
 */
@Injectable()
export class PostgresSessionStoreRepository extends ISessionStore {
  constructor(
    @InjectRepository(Session)
    private readonly repo: Repository<Session>,
  ) {
    super();
  }

  persist(data: DeepPartial<Session>): Promise<Session> {
    return this.repo.save(this.repo.create(data));
  }

  findActiveById(sessionId: string): Promise<Session | null> {
    return this.repo.findOne({
      where: { sessionId, status: SessionStatus.ACTIVE },
      relations: ['user'],
    });
  }

  findById(sessionId: string): Promise<Session | null> {
    return this.repo.findOne({ where: { sessionId } });
  }

  async updateBySessionId(
    sessionId: string,
    patch: Partial<Session>,
  ): Promise<void> {
    // BUG #3 FIX: legacy passed `sessionId` as a string criteria, which TypeORM
    // resolves against the PRIMARY key (`id`, a uuid) — never the `sessionId`
    // column. Writes silently matched nothing (and a non-uuid value is rejected
    // outright by Postgres). Target the `sessionId` column explicitly.
    await this.repo.update(
      { sessionId },
      patch as Parameters<Repository<Session>['update']>[1],
    );
  }

  async updateActiveByUser(
    userId: string,
    patch: Partial<Session>,
  ): Promise<void> {
    await this.repo.update(
      { userId, status: SessionStatus.ACTIVE },
      patch as Parameters<Repository<Session>['update']>[1],
    );
  }

  findActiveByUser(
    userId: string,
    exceptSessionId?: string,
  ): Promise<Session[]> {
    const where: FindOptionsWhere<Session> = {
      userId,
      status: SessionStatus.ACTIVE,
    };
    // BUG #1 FIX: legacy used Mongo-style `{ $ne: exceptSessionId }`, which
    // TypeORM silently ignored — `exceptCurrent` never excluded the session.
    if (exceptSessionId) {
      where.sessionId = Not(exceptSessionId);
    }
    return this.repo.find({ where, order: { lastActivity: 'DESC' } });
  }

  findAllActive(): Promise<Session[]> {
    return this.repo.find({ where: { status: SessionStatus.ACTIVE } });
  }

  findExpiredActive(now: Date): Promise<Session[]> {
    return this.repo.find({
      where: { status: SessionStatus.ACTIVE, expiresAt: LessThan(now) },
    });
  }

  findRecentActiveByUser(userId: string, since: Date): Promise<Session[]> {
    return this.repo.find({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
        createdAt: MoreThan(since),
      },
    });
  }

  countByStatus(status: SessionStatus): Promise<number> {
    return this.repo.count({ where: { status } });
  }

  countActiveByUser(userId: string): Promise<number> {
    return this.repo.count({
      where: { userId, status: SessionStatus.ACTIVE },
    });
  }

  countSuspicious(): Promise<number> {
    return this.repo.count({ where: { isSuspicious: true } });
  }

  countLocked(): Promise<number> {
    return this.repo.count({ where: { isLocked: true } });
  }
}
