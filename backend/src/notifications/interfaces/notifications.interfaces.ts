// src/notifications/interfaces/notifications.interfaces.ts
//
// ISP contracts for the notifications module. The 315-line `NotificationsService`
// god class fused three concerns (persistence + routing + transport); these
// interfaces segregate them so each CQRS service (Step 2) implements exactly
// one role, and consumers depend on the narrowest surface they need.

import {
  Notification,
  NotificationType,
  NotificationStatus,
} from '../entities/notification.entity';
import { CursorPaginatedResult } from '../dto/cursor-pagination.dto';

// Re-export the generic cursor envelope so consumers can pull it from the
// (eventual) barrel without reaching into `../dto`.
export type { CursorPaginatedResult } from '../dto/cursor-pagination.dto';

/**
 * Read view-type — the public projection of a notification, intentionally
 * decoupled from the TypeORM `Notification` entity (no lazy relations, no ORM
 * metadata). This is what crosses the module boundary; the entity stays sealed.
 */
export interface NotificationView {
  id: string;
  userId: string;
  organizationId?: string;
  message: string;
  context?: Record<string, unknown>;
  type: NotificationType;
  status: NotificationStatus;
  read: boolean;
  snoozedUntil?: Date;
  createdAt: Date;
}

/**
 * Read facade (CQRS query side). Backed by `NotificationQueryService` and bound
 * to `NOTIFICATION_INBOX_TOKEN`. Consumed by the controller GET routes, the
 * snooze worker (due sweep), and the dashboard module.
 */
export interface INotificationInbox {
  listForUser(
    userId: string,
    status?: NotificationStatus,
    organizationId?: string,
  ): Promise<NotificationView[]>;

  listForUserWithCursor(
    userId: string,
    status: NotificationStatus,
    cursor?: string,
    limit?: number,
    organizationId?: string,
  ): Promise<CursorPaginatedResult<NotificationView>>;

  listAllForUser(userId: string): Promise<NotificationView[]>;

  findOne(id: string): Promise<NotificationView | null>;

  getDueSnoozedNotifications(): Promise<NotificationView[]>;
}

/**
 * Write/dispatch facade (CQRS command side). Backed by
 * `NotificationCommandService` and bound to `NOTIFICATION_ROUTER_TOKEN`.
 * Performs persistence (via `INotificationRepository`) AND real-time delivery
 * (via `RealtimeTransportPort`). Consumed by the controller mutations, the
 * invite/achievement/analytics listeners, the snooze worker, and SmartDigest.
 *
 * Signatures are verbatim with the god class so the cut-over is behavior-safe.
 */
export interface INotificationRouter {
  createMany(
    userIds: string[],
    message: string,
    context?: Record<string, unknown>,
    type?: NotificationType,
  ): Promise<NotificationView[]>;

  markStatus(
    userId: string,
    notifId: string,
    status: NotificationStatus,
  ): Promise<void>;

  archiveAll(userId: string): Promise<void>;

  archive(userId: string, notifId: string): Promise<void>;

  snooze(
    userId: string,
    notifId: string,
    hours: number,
  ): Promise<NotificationView | null>;

  unsnooze(notifId: string): Promise<NotificationView | null>;

  deleteByContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<void>;

  deleteByMessageContent(userId: string, pattern: string): Promise<void>;
}

/**
 * Persistence port (the ClickHouse/raw-SQL swap seam), bound to
 * `NOTIFICATION_REPOSITORY_TOKEN` → `TypeormNotificationRepository` (Step 2).
 *
 * Pure data access: methods return ORM entities / id arrays. NO transport here
 * — the router maps entities to `NotificationView` and emits via the realtime
 * port. `deleteByContext` / `deleteByMessageLike` return the deleted ids so the
 * router can fire the WebSocket deletion event.
 */
export interface INotificationRepository {
  /** Build (not persist) entity rows for a fan-out create. */
  createEntities(
    userIds: string[],
    message: string,
    context: Record<string, unknown>,
    type: NotificationType,
  ): Notification[];

  save(notifs: Notification[]): Promise<Notification[]>;

  saveOne(notif: Notification): Promise<Notification>;

  findOneForUser(userId: string, id: string): Promise<Notification | null>;

  findById(id: string): Promise<Notification | null>;

  findForUser(
    userId: string,
    status: NotificationStatus,
    organizationId?: string,
  ): Promise<Notification[]>;

  findAllForUser(userId: string): Promise<Notification[]>;

  /**
   * Composite-keyset feed page. Encapsulates the `(createdAt, id)` seek
   * QueryBuilder + cursor encode/decode + `limit + 1` look-ahead. Hits the
   * `IDX_notification_feed (userId, status, createdAt, id)` covering index.
   */
  findFeedKeyset(
    userId: string,
    status: NotificationStatus,
    cursor: string | undefined,
    limit: number,
    organizationId?: string,
  ): Promise<CursorPaginatedResult<Notification>>;

  archiveAllUnread(userId: string): Promise<void>;

  archiveOne(userId: string, id: string): Promise<void>;

  /** JSONB `@>` containment delete; returns the deleted ids. */
  deleteByContext(
    userId: string,
    context: Record<string, unknown>,
  ): Promise<string[]>;

  /**
   * DB-level `ILIKE` delete over unread rows (replaces the god class's
   * fetch-all-then-filter-in-memory). `unescapedPattern` is a raw substring;
   * the implementation escapes `%` `_` `\` before wrapping as `%pattern%`.
   * Returns the deleted ids.
   */
  deleteByMessageLike(
    userId: string,
    unescapedPattern: string,
  ): Promise<string[]>;

  /** Snooze sweep — hits the partial index `IDX_notification_snooze_due`. */
  findDueSnoozed(now: Date): Promise<Notification[]>;
}
