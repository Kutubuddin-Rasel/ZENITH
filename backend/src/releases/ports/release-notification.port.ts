// src/releases/ports/release-notification.port.ts
/**
 * Outbound port for watcher notifications. Bound `useExisting: WatchersService`
 * in releases.module — `WatchersService.notifyWatchersOnEvent` structurally
 * satisfies this single method. Mirrors the comments module's
 * `CommentNotificationPort` inversion strategy: the god class injected the
 * concrete `WatchersService` (DIP leak); the CQRS command/deployment services
 * depend on this abstraction instead.
 *
 * `issueId` is nullable because most release events are release-scoped (no
 * single issue), while assign/unassign carry the affected issue.
 */
export abstract class ReleaseNotificationPort {
  abstract notifyWatchersOnEvent(
    projectId: string,
    issueId: string | null,
    action: string,
    actorId: string,
  ): Promise<void>;
}
