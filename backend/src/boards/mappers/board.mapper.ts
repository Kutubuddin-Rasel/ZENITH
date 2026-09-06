/**
 * Boards Module — Pure Entity → View-DTO mappers
 *
 * These functions are the single conversion layer between the TypeORM
 * entities (`Board`, `BoardColumn`) and the public ISP view DTOs
 * (`BoardSummary`, `BoardColumnView`, `BoardWithColumns`,
 * `KanbanCardView`, `KanbanColumnView`, `KanbanBoardView`) declared
 * in `interfaces/boards.interfaces.ts`.
 *
 * Why a separate file?
 * --------------------
 *  - Eliminates inline `{ … } as Board` casts that leaked across the
 *    legacy god-class.
 *  - Centralizes null-coercion (`description ?? null`, `statusId ?? null`)
 *    so the entity's "string but actually nullable" lie is told once
 *    and only once.
 *  - Makes mapping behavior independently unit-testable — these are
 *    pure functions with no DI dependency.
 *
 * Why not `@Injectable()`?
 * ------------------------
 * No state, no dependencies, no side effects. A class wrapper would
 * add ceremony without value. The CQRS services in Step 3 import
 * each function directly.
 *
 * Kanban-card mapping consumes the `KanbanCard` projection emitted
 * by `IIssueReader.findKanbanCards` (declared in
 * `database/interfaces/repository.interfaces.ts`) — NOT the `Issue`
 * entity. That's intentional: the slim Kanban endpoint must never
 * round-trip the heavy `description` / `metadata` / `embedding`
 * columns through application memory.
 */

import { Board } from '../entities/board.entity';
import { BoardColumn } from '../entities/board-column.entity';
import type { KanbanCard } from '../../database/interfaces/repository.interfaces';
import type {
  BoardColumnView,
  BoardSummary,
  BoardWithColumns,
  KanbanCardView,
  KanbanColumnView,
} from '../interfaces/boards.interfaces';

/**
 * Convert a `Board` entity row to the read-side `BoardSummary` DTO.
 *
 * `description` is widened to `string | null` to match the interface
 * contract — the entity declares `string` but the underlying column
 * is nullable in PostgreSQL.
 */
export function toBoardSummary(board: Board): BoardSummary {
  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    type: board.type,
    description: board.description ?? null,
    isActive: board.isActive,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

/**
 * Convert a `BoardColumn` entity row to the read-side `BoardColumnView`
 * DTO. `statusId` is widened to `string | null` per interface contract.
 */
export function toBoardColumnView(col: BoardColumn): BoardColumnView {
  return {
    id: col.id,
    boardId: col.boardId,
    name: col.name,
    statusId: col.statusId ?? null,
    columnOrder: col.columnOrder,
  };
}

/**
 * Convert a `Board` with its eager-loaded `columns` relation into the
 * `BoardWithColumns` projection. Sorts columns by `columnOrder`
 * ascending — the UI contract for every consumer of this surface.
 *
 * `board.columns` may be `undefined` when the entity was loaded
 * without the relation; the implementation gracefully returns an
 * empty array in that case rather than throwing — callers that
 * depend on populated columns must ensure the relation is loaded
 * upstream (`findScopedWithColumnsAndProject`).
 */
export function toBoardWithColumns(board: Board): BoardWithColumns {
  const columns = (board.columns ?? [])
    .slice()
    .sort((a, b) => a.columnOrder - b.columnOrder)
    .map(toBoardColumnView);
  return {
    ...toBoardSummary(board),
    columns,
  };
}

/**
 * Convert a `KanbanCard` projection (emitted by
 * `IIssueReader.findKanbanCards`) to the public `KanbanCardView`.
 *
 * Enum-to-string coercion mirrors the legacy controller payload
 * exactly — the frontend narrows on its own end.
 */
export function toKanbanCardView(card: KanbanCard): KanbanCardView {
  return {
    id: card.id,
    title: card.title,
    type: String(card.type),
    priority: String(card.priority),
    assigneeId: card.assigneeId ?? null,
    storyPoints: card.storyPoints,
    status: card.status,
    statusId: card.statusId ?? null,
    backlogOrder: card.backlogOrder,
  };
}

/**
 * Build a `KanbanColumnView` by joining a column row with its issue
 * subset. The grouping logic that decides which cards belong to which
 * column lives in `groupKanbanCardsByColumn` below — this function
 * only renders the final shape.
 */
export function toKanbanColumnView(
  col: BoardColumn,
  issues: readonly KanbanCard[],
): KanbanColumnView {
  return {
    id: col.id,
    name: col.name,
    statusId: col.statusId ?? null,
    columnOrder: col.columnOrder,
    issues: issues.map(toKanbanCardView),
  };
}

/**
 * Group Kanban cards by their owning column using a two-tier
 * matching strategy:
 *
 *   1. **Primary** — exact match on `card.statusId === col.statusId`.
 *      This is the source of truth post-relational-status migration.
 *   2. **Fallback** — match on `card.status === col.name` when the
 *      card was not matched in step 1. Required for legacy data
 *      seeded before the relational-status migration where columns
 *      may carry `statusId === null`.
 *
 * The returned map is keyed by `col.id` so the caller can iterate
 * the board's columns in display order and materialize each grouping
 * without a second pass over the cards.
 *
 * @returns Map keyed by `col.id`, value = ordered array of matched
 *          cards (preserves input ordering — already sorted by
 *          `backlogOrder ASC` upstream).
 */
export function groupKanbanCardsByColumn(
  columns: readonly BoardColumn[],
  cards: readonly KanbanCard[],
): Map<string, KanbanCard[]> {
  const byColumnId = new Map<string, KanbanCard[]>();
  const idByStatusId = new Map<string, string>();
  const idByName = new Map<string, string>();

  for (const col of columns) {
    byColumnId.set(col.id, []);
    if (col.statusId) idByStatusId.set(col.statusId, col.id);
    idByName.set(col.name, col.id);
  }

  for (const card of cards) {
    let targetColId: string | undefined;
    if (card.statusId) {
      targetColId = idByStatusId.get(card.statusId);
    }
    if (!targetColId) {
      targetColId = idByName.get(card.status);
    }
    if (targetColId) {
      byColumnId.get(targetColId)!.push(card);
    }
  }

  return byColumnId;
}
