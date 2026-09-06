// src/notifications/services/notification-view.mapper.ts
import { Notification } from '../entities/notification.entity';
import { NotificationView } from '../interfaces/notifications.interfaces';

/**
 * Pure mapper: TypeORM `Notification` entity → public `NotificationView`.
 *
 * Strips ORM metadata and the lazy `user` relation so the entity never crosses
 * the module boundary. Shared by the query (read) and command (write) CQRS
 * services — the single place entity→view translation lives.
 */
export function toNotificationView(n: Notification): NotificationView {
  return {
    id: n.id,
    userId: n.userId,
    organizationId: n.organizationId,
    message: n.message,
    context: (n.context as Record<string, unknown> | undefined) ?? undefined,
    type: n.type,
    status: n.status,
    read: n.read,
    snoozedUntil: n.snoozedUntil,
    createdAt: n.createdAt,
  };
}
