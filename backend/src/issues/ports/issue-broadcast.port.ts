/**
 * Issues Module — Outbound Port: IssueBroadcastPort
 *
 * The issues god class broadcast helper reached across TWO aggregate
 * boundaries at once:
 *   1. `boardRepo.findByProject(projectId)` — to enumerate a project's boards,
 *   2. `boardGateway.server.to('board:${id}').emit(event, payload)` — to push
 *      a socket event into each board's room.
 *
 * That tied issues to both the `BoardRepository` and the Socket.io
 * `BoardGateway.server` instance (DIP CRITICAL) for a concern that is purely
 * "tell the realtime layer something changed."
 *
 * Inversion strategy: issues owns this single-method contract; the `@Global`
 * `GatewaysModule` (which owns both `BoardGateway` and a board repo) binds the
 * adapter via `{ provide: IssueBroadcastPort, useClass: IssueBroadcastAdapter }`
 * and re-exports it. The board-enumeration + per-room emit loop moves entirely
 * into the adapter, so issues no longer injects `BoardRepository` or
 * `BoardGateway` at all.
 */
export abstract class IssueBroadcastPort {
  /**
   * Fan a realtime event out to every board room belonging to `projectId`.
   * Best-effort: a transport failure must NOT fail the originating request
   * (the adapter swallows + logs socket errors).
   *
   * @param projectId  project whose board rooms receive the event.
   * @param event      socket event name (e.g. `'issue.created'`).
   * @param payload    serialisable event body.
   */
  abstract broadcastToProjectBoards(
    projectId: string,
    event: string,
    payload: unknown,
  ): Promise<void>;
}
