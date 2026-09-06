// src/comments/ports/comment-notification.port.ts
/**
 * Outbound port for watcher notifications. Bound `useExisting: WatchersService`
 * in comments.module — WatchersService structurally satisfies this single method.
 * Mirrors the issues module's IssueBroadcastPort inversion strategy.
 */
export abstract class CommentNotificationPort {
  abstract notifyWatchersOnEvent(
    projectId: string,
    issueId: string,
    action: string,
    actorId: string,
  ): Promise<void>;
}
