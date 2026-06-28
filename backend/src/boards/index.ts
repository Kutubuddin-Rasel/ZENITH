/**
 * Boards Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only abstract contracts, DI tokens, the
 * `BoardType` enum, and the two outbound ports (`WorkflowLookupPort`,
 * `BoardSeedPort`) are exported. Concrete services, TypeORM entities,
 * repositories, the HTTP controller, the realtime gateway, and the
 * `BoardsModule` class itself are module-internal and must be
 * consumed exclusively through the tokens declared in
 * `constants/boards.tokens.ts`.
 *
 * Mirrors `projects/index.ts:1-77` exactly — same convention, same
 * comment shape, same export discipline. Boards is the second Level 3
 * aggregate to be sealed; projects was the first (and the exemplar).
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `boards.module`                   → `app.module.ts` imports the
 *                                        class by direct path; no other
 *                                        non-app module should. The
 *                                        two legitimate cross-module
 *                                        imports (`sprints.module`,
 *                                        `project-templates.module`)
 *                                        keep the direct path because
 *                                        NestJS DI wiring needs the
 *                                        class symbol — but those
 *                                        modules consume *runtime*
 *                                        capabilities exclusively
 *                                        through the tokens /
 *                                        `BoardSeedPort` exported
 *                                        here.
 *  - `services/*`                      → bound behind ISP tokens
 *                                        (`BOARD_QUERY_TOKEN`,
 *                                        `BOARD_COMMAND_TOKEN`,
 *                                        `BOARD_COLUMN_COMMAND_TOKEN`,
 *                                        `BOARD_ORDERING_COMMAND_TOKEN`)
 *                                        and the `BoardSeedPort`
 *                                        abstract class; never
 *                                        injected as concrete classes.
 *                                        The legacy `BoardsService`
 *                                        god-class was deleted in
 *                                        Step 3 commit 9.
 *  - `entities/*`                      → TypeORM persistence detail.
 *                                        Public DTO projections on
 *                                        `IBoardQuery`,
 *                                        `IBoardCommand`,
 *                                        `IBoardColumnCommand`,
 *                                        `IBoardOrderingCommand`
 *                                        (`BoardSummary`,
 *                                        `BoardColumnView`,
 *                                        `BoardWithColumns`,
 *                                        `KanbanBoardView`,
 *                                        `KanbanColumnView`,
 *                                        `KanbanCardView`)
 *                                        replace them across the
 *                                        boundary. Persistence-layer
 *                                        consumers (`database/`,
 *                                        `gateways/`, `revisions/`)
 *                                        retain direct entity imports
 *                                        — they ARE the persistence
 *                                        boundary, not domain
 *                                        consumers.
 *  - `mappers/*`                       → pure transform helpers, used
 *                                        only by the internal
 *                                        services. Not part of the
 *                                        public surface.
 *  - `controllers/*`,
 *    `boards.controller`               → HTTP entry point, not for
 *                                        injection.
 *  - `dto/*`                           → HTTP request shapes; consumers
 *                                        speak the typed command
 *                                        specs on `BoardSeedPort`
 *                                        (`BoardSeedSpec`) and the
 *                                        ISP interfaces. `CreateBoardDto`
 *                                        / `UpdateBoardDto` / column
 *                                        DTOs stay HTTP-layer
 *                                        artifacts.
 *  - `TypeOrmModule`                   → no
 *                                        `@InjectRepository(Board*)`
 *                                        is permitted outside
 *                                        `database/repositories/`
 *                                        (enforced by the Step 4
 *                                        boundary lint rule and by
 *                                        `boards.module.ts` NOT
 *                                        re-exporting `TypeOrmModule`).
 *
 * The outbound `BoardSeedPort` IS exported so `project-templates` can
 * inject the abstract class and seed boards during template
 * application without re-introducing the legacy
 * `forwardRef(() => BoardsService)` cycle.
 *
 * The outbound `WorkflowLookupPort` IS exported because boards owns
 * the *contract* — the workflows module binds the adapter
 * (`workflows/adapters/workflow-lookup.adapter.ts`) and re-exports
 * the same abstract-class-as-token from `workflows.module.ts`. The
 * mirror is symmetric: every consumer of `WorkflowLookupPort` imports
 * it from `'boards'`, never from `'workflows'`.
 *
 * If you need to add a new public surface, add an interface to
 * `interfaces/boards.interfaces.ts` (or a port to `ports/`) and a
 * token to `constants/boards.tokens.ts`. Never re-export a class from
 * here.
 */

export * from './interfaces/boards.interfaces';
export * from './constants/boards.tokens';
export * from './enums/board-type.enum';
export * from './ports/workflow-lookup.port';
export * from './ports/board-seed.port';
