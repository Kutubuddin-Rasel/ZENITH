/**
 * Invites Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only abstract contracts, DI tokens, domain
 * vocabulary (`InviteStatus`), event-bus contracts, and the outbound
 * `ProjectLookupPort` are exported. Concrete services, TypeORM
 * entities, repositories, the HTTP controllers, and the
 * `InvitesModule` class itself are module-internal and must be
 * consumed exclusively through the tokens declared in
 * `constants/invites.tokens.ts`.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `invites.module`                  → `app.module.ts` imports the
 *                                        class by direct path; no other
 *                                        module should.
 *  - `services/*`                      → bound behind ISP tokens; never
 *                                        injected as concrete classes.
 *                                        The legacy `InvitesService`
 *                                        god-class was deleted in
 *                                        Step 3.
 *  - `entities/invite.entity`          → TypeORM persistence detail.
 *                                        Public DTOs on `IInviteQuery`
 *                                        / `IInviteCommand`
 *                                        (`InviteSummary`,
 *                                        `InviteWithRelations`,
 *                                        `BulkInviteResult`, etc.)
 *                                        replace it across the
 *                                        boundary.
 *  - `repositories/*`                  → DIP boundary lives inside the
 *                                        module; only the abstract
 *                                        class binds the Postgres
 *                                        implementation.
 *  - `controllers/*`,
 *    `invites.controller`              → HTTP entry points, not for
 *                                        injection.
 *  - `dto/*`                           → HTTP request shapes; consumers
 *                                        speak the typed command DTOs
 *                                        on `IInviteCommand`.
 *  - `TypeOrmModule`                   → no `@InjectRepository(Invite)`
 *                                        is permitted outside
 *                                        `invites/repositories/`
 *                                        (enforced by the Step 4
 *                                        boundary sweep and by
 *                                        `invites.module.ts` NOT
 *                                        re-exporting `TypeOrmModule`).
 *
 * The outbound `ProjectLookupPort` IS exported so external modules
 * (specifically `ProjectsModule`) can bind a concrete adapter to
 * satisfy the inverted dependency without re-introducing the legacy
 * `forwardRef(() => ProjectsModule)` cycle.
 *
 * If you need to add a new public surface, add an interface to
 * `interfaces/invites.interfaces.ts` and a token to
 * `constants/invites.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/invites.interfaces';
export * from './constants/invites.tokens';
export * from './enums/invite-status.enum';
export * from './events/invites-events';
export * from './ports/project-lookup.port';
