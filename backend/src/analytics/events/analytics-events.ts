// src/analytics/events/analytics-events.ts
/**
 * Domain events emitted by the analytics module.
 *
 * L1 decoupling: the daily stall-detection cron used to inject the CONCRETE
 * `NotificationsService` and call `createMany(...)` synchronously — the last
 * Level-3 ↔ Level-3 write coupling. It now emits `ANALYTICS_EVENTS.STALL_ALERT`
 * and an `@OnEvent` listener INSIDE the notifications module owns the fan-out,
 * so zero synchronous cross-module writes remain.
 *
 * Re-exported from the sealed `analytics` barrel (`index.ts`) so the
 * notifications listener consumes the contract via `'../../analytics'`, never a
 * deep path — consistent with how analytics already publishes its tokens.
 */
export const ANALYTICS_EVENTS = {
  /** Assignees have stalled issues (no activity beyond the stall threshold). */
  STALL_ALERT: 'analytics.stall-alert',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Payload for `ANALYTICS_EVENTS.STALL_ALERT`. `message`/`context` are carried
 * VERBATIM from the old `createMany(userIds, message, context, WARNING)` call,
 * so the resulting in-app notification is byte-identical; the listener encodes
 * the `WARNING` type on the notifications side.
 */
export interface AnalyticsStallAlertEvent {
  readonly userIds: string[];
  readonly message: string;
  readonly context: Record<string, unknown>;
}
