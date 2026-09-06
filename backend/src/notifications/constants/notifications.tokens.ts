// src/notifications/constants/notifications.tokens.ts
//
// DI tokens for the notifications module's segregated contracts. Consumers (the
// controller, listeners, workers, and external Level-3 modules) inject these
// symbols, never the concrete service/repository classes — preserving DIP
// across the module boundary.

/** Read surface — `INotificationInbox` (inbox/feed queries). External seam: dashboard. */
export const NOTIFICATION_INBOX_TOKEN = Symbol('NOTIFICATION_INBOX_TOKEN');

/** Write/dispatch surface — `INotificationRouter` (create + lifecycle + transport). */
export const NOTIFICATION_ROUTER_TOKEN = Symbol('NOTIFICATION_ROUTER_TOKEN');

/** Persistence port — `INotificationRepository`. The ClickHouse/raw-SQL swap seam. */
export const NOTIFICATION_REPOSITORY_TOKEN = Symbol(
  'NOTIFICATION_REPOSITORY_TOKEN',
);

// NB: the transport ports (`RealtimeTransportPort` / `EmailTransportPort`) are
// exported as abstract classes from `../ports/*` and used directly as DI tokens
// — they are NOT symbol tokens (an abstract class is both a runtime token and a
// type you can `extends`, which is how the gateway/adapter bind via useExisting).
