// src/boards/ports/board-realtime.port.ts
import type {
  ColumnsReorderedPayload,
  IssueCreatedPayload,
  IssueDeletedPayload,
  IssueMovedPayload,
  IssueReorderedPayload,
  IssueUpdatedPayload,
} from '../interfaces/board-events.interfaces';

/**
 * Boards Module — Outbound Port: BoardRealtimePort
 *
 * `BoardOrderingService` injected the CONCRETE `BoardGateway` class by deep
 * path (`../../gateways/board.gateway`), which meant a Level-4 domain service
 * held a direct reference to a Socket.io gateway — and, transitively, to the
 * raw `Server` handle hanging off it. That is the last un-inverted realtime
 * edge in the codebase; `issues` was inverted in its own Step 2b via
 * `IssueBroadcastPort`, and this port is the exact same shape.
 *
 * Inversion strategy (identical to `issues/ports/issue-broadcast.port.ts`):
 * boards owns the contract, the `@Global GatewaysModule` binds the adapter
 * via `{ provide: BoardRealtimePort, useClass: BoardRealtimeAdapter }` and
 * re-exports it. Boards never imports from `gateways` again.
 *
 * WHY SIX METHODS AND NOT ONE `emit(event, payload)`: the six payload shapes
 * ARE the design. A generic `emit(string, unknown)` would compile for a typo'd
 * event name and a malformed body alike; the frontend's delta-update cache
 * patching has no runtime schema to catch that. Six signatures buy a
 * compile-time contract across the socket boundary for the cost of five extra
 * lines in one adapter.
 *
 * DELIVERY SEMANTICS: best-effort and synchronous-looking. A realtime hiccup
 * must never fail the originating mutation — the adapter swallows and logs
 * socket errors, matching `IssueBroadcastAdapter`.
 */
export abstract class BoardRealtimePort {
  /** An issue changed column and/or position. */
  abstract emitIssueMoved(boardId: string, payload: IssueMovedPayload): void;

  /** An issue was created on the board. */
  abstract emitIssueCreated(
    boardId: string,
    payload: IssueCreatedPayload,
  ): void;

  /** An issue's fields changed in place. */
  abstract emitIssueUpdated(
    boardId: string,
    payload: IssueUpdatedPayload,
  ): void;

  /** An issue was removed from the board. */
  abstract emitIssueDeleted(
    boardId: string,
    payload: IssueDeletedPayload,
  ): void;

  /** Issues were re-ordered within a single column. */
  abstract emitIssueReordered(
    boardId: string,
    payload: IssueReorderedPayload,
  ): void;

  /** The board's columns were re-ordered. */
  abstract emitColumnsReordered(
    boardId: string,
    payload: ColumnsReorderedPayload,
  ): void;
}
