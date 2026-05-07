// src/watchers/enums/watch-preference.enum.ts
/**
 * Notification filtering levels for a watcher subscription.
 * - ALL: every watcher event is delivered (default, backward-compatible)
 * - MENTIONS_ONLY: only events whose payload mentions this user
 * - STATUS_CHANGES: only events that represent a status transition
 */
export enum WatchPreference {
  ALL = 'ALL',
  MENTIONS_ONLY = 'MENTIONS_ONLY',
  STATUS_CHANGES = 'STATUS_CHANGES',
}
