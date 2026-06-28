/**
 * Boards Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the boards module is
 * wired through these symbol tokens. Symbols guarantee module-scope
 * uniqueness and prevent accidental string-key collisions across the
 * monorepo (`provider.useExisting`, `@Inject(STR)` etc.).
 *
 * Convention
 * ----------
 *  - `BOARD_*_TOKEN`              → interfaces owned by the boards module
 *                                   (`IBoardQuery`, `IBoardCommand`,
 *                                   `IBoardColumnCommand`,
 *                                   `IBoardOrderingCommand`).
 *
 * Repository tokens (`BoardRepository`, `IssueRepository`,
 * `BoardColumnRepository` — the last one lands in Step 2) are
 * intentionally NOT represented here. Per the established pattern
 * (`ProjectRepository`, `BoardRepository`, `AbstractInviteRepository`),
 * abstract repository classes double as their own DI tokens in
 * NestJS, so the binding uses the abstract class directly rather
 * than a separate symbol.
 *
 * Outbound ports (`WorkflowLookupPort`, `BoardSeedPort`) live under
 * `boards/ports/` and likewise use abstract-class-as-token — no
 * symbol indirection.
 *
 * Step 1 binds all four tokens via `useExisting: BoardsService` so
 * the legacy god class continues to serve every consumer while
 * consumers begin migrating to the interface tokens. Step 3 swaps
 * the bindings to the freshly-decomposed CQRS services
 * (`BoardQueryService`, `BoardCommandService`,
 * `BoardColumnCommandService`, `BoardOrderingService`) with zero
 * call-site churn.
 */

// ---------------------------------------------------------------------------
// Internal service surfaces (ISP-segregated)
// ---------------------------------------------------------------------------

export const BOARD_QUERY_TOKEN = Symbol('BOARD_QUERY_TOKEN');
export const BOARD_COMMAND_TOKEN = Symbol('BOARD_COMMAND_TOKEN');
export const BOARD_COLUMN_COMMAND_TOKEN = Symbol('BOARD_COLUMN_COMMAND_TOKEN');
export const BOARD_ORDERING_COMMAND_TOKEN = Symbol(
  'BOARD_ORDERING_COMMAND_TOKEN',
);

// ---------------------------------------------------------------------------
// Token type aliases — handy when typing test fixtures / providers.
// ---------------------------------------------------------------------------

export type BoardQueryToken = typeof BOARD_QUERY_TOKEN;
export type BoardCommandToken = typeof BOARD_COMMAND_TOKEN;
export type BoardColumnCommandToken = typeof BOARD_COLUMN_COMMAND_TOKEN;
export type BoardOrderingCommandToken = typeof BOARD_ORDERING_COMMAND_TOKEN;
