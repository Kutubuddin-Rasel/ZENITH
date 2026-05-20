/**
 * RBAC Module — Public Barrel (SEALED, Step 5)
 *
 * STRICT BOUNDARY: only abstract contracts and DI tokens are exported.
 * Concrete services, TypeORM entities, repositories, and the
 * `RBACModule` class itself are module-internal and must be consumed
 * exclusively through the tokens declared in `constants/rbac.tokens.ts`.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `rbac.module`            → consumers import the class by direct path
 *                                (only `app.module.ts` is allowed to).
 *  - `services/*`             → bound behind ISP tokens; never injected
 *                                as concrete classes.
 *  - `entities/role.entity`   → TypeORM persistence detail. Public DTOs
 *  - `entities/permission.entity` exposed on `IRoleQueryService` and
 *                                `IPermissionQueryService` replace these.
 *  - `repositories/*`         → DIP boundary lives inside the module.
 *  - `cache/*`, `seed/*`, `adapters/*`, `domain/*` → implementation
 *                                details of the bound providers.
 *  - `TypeOrmModule`          → no `@InjectRepository(Role|Permission)`
 *                                is permitted outside `rbac/repositories/`
 *                                (enforced by the Step 5 security sweep
 *                                and by `rbac.module.ts` NOT
 *                                re-exporting `TypeOrmModule`).
 *
 * If you need to add a new public surface, add an interface to
 * `interfaces/rbac.interfaces.ts` (or a port to `ports/rbac.ports.ts`)
 * and a token to `constants/rbac.tokens.ts`. Never re-export a class
 * from here.
 */

export * from './interfaces/rbac.interfaces';
export * from './ports/rbac.ports';
export * from './constants/rbac.tokens';
