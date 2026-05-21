/**
 * Membership Module — Public Barrel (SEALED, Step 4)
 *
 * STRICT BOUNDARY: only abstract contracts, DI tokens, domain
 * vocabulary (`ProjectRole`), and event-bus contracts are exported.
 * Concrete services, TypeORM entities, repositories, adapters, and the
 * `MembershipModule` class itself are module-internal and must be
 * consumed exclusively through the tokens declared in
 * `constants/membership.tokens.ts`.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `membership.module`              → `app.module.ts` imports the
 *                                       class by direct path; no other
 *                                       module should.
 *  - `services/*`                     → bound behind ISP tokens; never
 *                                       injected as concrete classes.
 *  - `entities/project-member.entity` → TypeORM persistence detail.
 *                                       Public DTOs on
 *                                       `IProjectMemberQuery` /
 *                                       `IProjectMemberCommand`
 *                                       (`ProjectMemberSummary`,
 *                                       `ProjectMemberWithUser`,
 *                                       `UserMembership`, etc.)
 *                                       replace it.
 *  - `repositories/*`                 → DIP boundary lives inside the
 *                                       module; only the abstract
 *                                       class binds the Postgres
 *                                       implementation.
 *  - `adapters/*`                     → implementation detail of the
 *                                       outbound RBAC port binding.
 *  - `controllers/*`,
 *    `project-members/*`              → HTTP entry points, not for
 *                                       injection.
 *  - `TypeOrmModule`                  → no `@InjectRepository(ProjectMember)`
 *                                       is permitted outside
 *                                       `membership/repositories/`
 *                                       (enforced by the Step 4
 *                                       boundary sweep and by
 *                                       `membership.module.ts` NOT
 *                                       re-exporting `TypeOrmModule`).
 *
 * If you need to add a new public surface, add an interface to
 * `interfaces/membership.interfaces.ts` and a token to
 * `constants/membership.tokens.ts`. Never re-export a class from here.
 */

export * from './interfaces/membership.interfaces';
export * from './constants/membership.tokens';
export * from './enums/project-role.enum';
export * from './events/membership-events';
