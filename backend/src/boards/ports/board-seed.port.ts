/**
 * Boards Module — Outbound Port: BoardSeedPort
 *
 * `template-application.service.ts` and `project-wizard.service.ts`
 * (both inside `project-templates`) seed boards as part of project
 * creation. Today this is wired via
 *   `@Inject(forwardRef(() => BoardsService))`
 * paired with the matching `forwardRef(() => BoardsModule)` in
 * `project-templates.module.ts:10,45` — a circular dependency hint
 * that papers over the structural cycle:
 *
 *   ProjectTemplatesModule  ─ uses ─▶  BoardsService (create)
 *           ▲                                  │
 *           └──── BoardsModule needs templates ┘ (historically)
 *
 * The cycle exists because project-templates calls into boards to
 * seed boards during template application; boards no longer calls
 * into project-templates (that arrow was removed earlier), so the
 * remaining dependency is one-way — but the `forwardRef` survives
 * because project-templates injects the *concrete*
 * `BoardsService` class.
 *
 * Inversion strategy
 * ------------------
 * Boards (the *capability owner* in this case — it owns
 * `create()`) declares the contract here. `BoardSeedPort` is bound
 * inside `boards.module.ts` via:
 *
 *   { provide: BoardSeedPort, useExisting: BoardCommandService }
 *
 * once Step 3 lands the `BoardCommandService`. No adapter is
 * required on the project-templates side — it merely imports the
 * port from the sealed barrel and injects the abstract class.
 *
 * Why a seed-only port instead of re-exporting `IBoardCommand`?
 *   - `IBoardCommand` carries `update` and `remove` — project-
 *     templates has no business touching those during seeding.
 *   - The seed surface accepts a typed spec (`BoardSeedSpec`)
 *     with first-class columns array, eliminating the legacy
 *     `CreateBoardDto.columns?: any[]` `any`-leak at the template
 *     boundary (zero `any` is mandatory per `SOLID_STANDARDS.md`).
 *   - The return shape is narrowed to `{ boardId }` — templates
 *     don't need the columns echoed back; they already have the
 *     spec they sent in.
 *
 * Step 3 build sequence:
 *   - Commit 4 binds `BoardSeedPort` here via `useExisting:
 *     BoardCommandService`.
 *   - Commit 8 migrates `template-application.service.ts` and
 *     `project-wizard.service.ts` from `forwardRef(() =>
 *     BoardsService)` to `@Inject(BoardSeedPort)`, then deletes
 *     the `forwardRef(() => BoardsModule)` from
 *     `project-templates.module.ts`.
 *
 * Abstract-class-as-DI-token: NestJS resolves the binding by
 * reference identity on the class symbol — mirrors
 * `TemplateApplicationPort` (the precedent that broke the
 * `ProjectsModule ↔ ProjectTemplatesModule` cycle in the previous
 * refactor).
 */

import type { BoardType } from '../enums/board-type.enum';

/**
 * Input specification for a templated board seed. Strongly typed
 * to replace the legacy `CreateBoardDto.columns?: any[]` field —
 * the template caller knows the column shape exactly, so the port
 * surfaces it precisely.
 *
 * `columns` is optional: when omitted, the seeding implementation
 * falls back to the default columns per `BoardType` (Kanban → 3,
 * Scrum → 4) — identical to the current `BoardsService.create()`
 * behavior so template authors can opt out of explicit columns.
 *
 * `actorUserId` is the system user (or the user kicking off the
 * project wizard); the resulting `board.event` audit payload uses
 * it as the `actorId`.
 */
export interface BoardSeedSpec {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly name: string;
  readonly type: BoardType;
  readonly description?: string;
  readonly columns?: ReadonlyArray<{
    readonly name: string;
    readonly order: number;
    readonly statusId?: string;
  }>;
}

/**
 * Narrow result returned by `seed`. Templates only need the id to
 * persist the linkage on the parent project; the full board view
 * is intentionally NOT echoed back to keep the seed surface
 * minimal.
 */
export interface BoardSeedResult {
  readonly boardId: string;
}

export abstract class BoardSeedPort {
  /**
   * Seed a board (and its columns) for a freshly-created project.
   * The implementation MUST execute board + columns inside a
   * single transaction (Step 2 fixes the current atomicity gap)
   * so a partial failure during column persistence rolls back the
   * board row — no orphan boards.
   *
   * Implementations MUST emit the standard `board.event` audit
   * payload via EventEmitter2 after the transaction commits, so
   * template-driven board creations show up in the project
   * activity feed identically to user-driven creations.
   *
   * Throws on persistence failure (caller may surface the error
   * as a wizard step failure); does NOT swallow.
   */
  abstract seed(spec: BoardSeedSpec): Promise<BoardSeedResult>;
}
