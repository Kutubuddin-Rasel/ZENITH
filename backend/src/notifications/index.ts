/**
 * Notifications Module — Public Barrel (SEALED, Step 3)
 *
 * STRICT BOUNDARY: only the ISP contracts, DI tokens, the generic pagination
 * envelope, and the two notification enums are exported here. The decomposed
 * CQRS services (`NotificationQueryService` / `NotificationCommandService`), the
 * persistence adapter (`TypeormNotificationRepository`), the transport ports +
 * their bindings (`RealtimeTransportPort` / `NotificationsGateway` /
 * `EmailTransportPort` / `EmailNotificationAdapter`), the event listeners, the
 * BullMQ/cron workers, the `Notification` TypeORM entity, the HTTP controller,
 * and the `NotificationsModule` class itself are module-internal and must be
 * consumed exclusively through the tokens below.
 *
 * Mirrors `analytics/index.ts` / `releases/index.ts` — same convention, same
 * export discipline. The former 315-line `NotificationsService` god class is
 * GONE (Step 3); its three concerns now live behind `NOTIFICATION_INBOX_TOKEN`
 * (read), `NOTIFICATION_ROUTER_TOKEN` (write/dispatch), and
 * `NOTIFICATION_REPOSITORY_TOKEN` (the ClickHouse/raw-SQL swap seam).
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`      → bound behind the ISP tokens; never injected concretely.
 *  - `repositories/*`  → the persistence DIP seam — internal to the module.
 *  - `ports/*`         → `RealtimeTransportPort` / `EmailTransportPort` are
 *                        wired internally (gateway `useExisting`, adapter
 *                        `useClass`); no external code provides transport.
 *  - `adapters/*`      → transport-port implementations, internal.
 *  - `listeners/*` / `processors/*` → event/queue plumbing, not injection targets.
 *  - `entities/*`      → FULL entity seal (L3). No external TypeORM relation
 *                        points INTO `Notification`, so the class stays internal;
 *                        `NotificationType` / `NotificationStatus` (the value
 *                        enums consumers actually need) are re-exported below.
 *  - `*.controller` / `*.gateway` → HTTP / WebSocket entry points, not targets.
 *  - `NotificationsModule` → imported by direct path for DI membership; not re-exported.
 *
 * To add a new public surface: add an interface to
 * `interfaces/notifications.interfaces.ts` and a token to
 * `constants/notifications.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/notifications.interfaces';
export * from './constants/notifications.tokens';

// Generic cursor envelope (the inbox feed return type). Explicit re-export
// disambiguates the `export *` above, which also surfaces it from the
// interfaces file's type re-export.
export { CursorPaginatedResult } from './dto/cursor-pagination.dto';

// Lone value re-exports: the notification type/status enums are part of the
// public contract (`NotificationView.type` / `.status`, the `?status=` query
// param, dashboard's `NotificationStatus.UNREAD`). The `Notification` entity
// class stays module-internal (L3 full seal).
export {
  NotificationType,
  NotificationStatus,
} from './entities/notification.entity';
