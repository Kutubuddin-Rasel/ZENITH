// src/notifications/repositories/typeorm-notification.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from '../entities/notification.entity';
import { INotificationRepository } from '../interfaces/notifications.interfaces';
import {
  CursorPaginatedResult,
  decodeCursor,
  encodeCursor,
} from '../dto/cursor-pagination.dto';

/**
 * Persistence adapter for the notifications aggregate — the lone owner of raw
 * TypeORM access, bound to `NOTIFICATION_REPOSITORY_TOKEN`. Every QueryBuilder
 * is relocated VERBATIM from the former `NotificationsService` god class
 * (keyset feed, JSONB `@>` containment delete, snooze-due sweep), so behavior
 * is byte-identical.
 *
 * Pure data access: methods return entities / id arrays and perform NO
 * transport. This is the ClickHouse/raw-SQL swap seam.
 */
@Injectable()
export class TypeormNotificationRepository implements INotificationRepository {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  createEntities(
    userIds: string[],
    message: string,
    context: Record<string, unknown>,
    type: NotificationType,
  ): Notification[] {
    return userIds.map((uid) =>
      this.repo.create({ userId: uid, message, context, type }),
    );
  }

  save(notifs: Notification[]): Promise<Notification[]> {
    return this.repo.save(notifs);
  }

  saveOne(notif: Notification): Promise<Notification> {
    return this.repo.save(notif);
  }

  findOneForUser(userId: string, id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findById(id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id } });
  }

  findForUser(
    userId: string,
    status: NotificationStatus,
    organizationId?: string,
  ): Promise<Notification[]> {
    const where: FindOptionsWhere<Notification> = { userId, status };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  findAllForUser(userId: string): Promise<Notification[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Composite-keyset feed page. `(createdAt, id)` seek + `limit + 1`
   * look-ahead, now backed by `IDX_notification_feed (userId, status,
   * createdAt, id)` (no Sort node). Relocated verbatim from the god class.
   */
  async findFeedKeyset(
    userId: string,
    status: NotificationStatus,
    cursor: string | undefined,
    limit: number,
    organizationId?: string,
  ): Promise<CursorPaginatedResult<Notification>> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.status = :status', { status })
      .orderBy('n.createdAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .take(safeLimit + 1);

    if (organizationId) {
      qb.andWhere('n.organizationId = :organizationId', { organizationId });
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        qb.andWhere(
          '(n.createdAt < :lastCreatedAt OR (n.createdAt = :lastCreatedAt AND n.id < :lastId))',
          {
            lastCreatedAt: new Date(decoded.createdAt),
            lastId: decoded.id,
          },
        );
      }
    }

    const results = await qb.getMany();

    const hasNextPage = results.length > safeLimit;
    const data = hasNextPage ? results.slice(0, safeLimit) : results;

    const nextCursor =
      hasNextPage && data.length > 0
        ? encodeCursor(
            data[data.length - 1].createdAt,
            data[data.length - 1].id,
          )
        : null;

    return { data, nextCursor };
  }

  async archiveAllUnread(userId: string): Promise<void> {
    await this.repo.update(
      { userId, status: NotificationStatus.UNREAD },
      { status: NotificationStatus.DONE, read: true },
    );
  }

  async archiveOne(userId: string, id: string): Promise<void> {
    await this.repo.update(
      { id, userId },
      { status: NotificationStatus.ARCHIVED, read: true },
    );
  }

  /**
   * JSONB `@>` containment delete (DB-level filtering). Returns the deleted
   * ids so the router can fire the WebSocket deletion event.
   */
  async deleteByContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<string[]> {
    const matching = await this.repo
      .createQueryBuilder('notification')
      .select(['notification.id'])
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.context @> :context::jsonb', {
        context: JSON.stringify(context),
      })
      .getMany();

    if (matching.length === 0) return [];

    const ids = matching.map((n) => n.id);
    await this.repo.delete(ids);
    return ids;
  }

  /**
   * DSA: DB-level `ILIKE` delete over UNREAD rows — replaces the god class's
   * fetch-all-unread → `.filter(includes)` in-memory scan. `unescapedPattern`
   * is a literal substring (e.g. a project name), so LIKE metacharacters are
   * escaped (backslash first) and a fixed `ESCAPE '\'` clause is used. Returns
   * the deleted ids.
   */
  async deleteByMessageLike(
    userId: string,
    unescapedPattern: string,
  ): Promise<string[]> {
    const escaped = unescapedPattern
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');

    const matching = await this.repo
      .createQueryBuilder('notification')
      .select(['notification.id'])
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.status = :status', {
        status: NotificationStatus.UNREAD,
      })
      .andWhere("notification.message ILIKE :pattern ESCAPE '\\'", {
        pattern: `%${escaped}%`,
      })
      .getMany();

    if (matching.length === 0) return [];

    const ids = matching.map((n) => n.id);
    await this.repo.delete(ids);
    return ids;
  }

  findDueSnoozed(now: Date): Promise<Notification[]> {
    return this.repo
      .createQueryBuilder('notification')
      .where('notification.status = :status', {
        status: NotificationStatus.SNOOZED,
      })
      .andWhere('notification.snoozedUntil <= :now', { now })
      .getMany();
  }
}
