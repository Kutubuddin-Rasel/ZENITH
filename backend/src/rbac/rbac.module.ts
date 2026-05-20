import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { CacheModule } from '../cache/cache.module';
import { MembershipModule } from '../membership/membership.module';

// DI tokens (Step 1)
import { PERMISSION_CHECKER_TOKEN } from '../circuit-breaker/constants/circuit-breaker.tokens';
import {
  RBAC_PERMISSION_CACHE_TOKEN,
  RBAC_PERMISSION_POLICY_TOKEN,
  RBAC_PERMISSION_QUERY_TOKEN,
  RBAC_ROLE_COMMAND_TOKEN,
  RBAC_ROLE_HIERARCHY_TOKEN,
  RBAC_ROLE_QUERY_TOKEN,
  RBAC_SEEDER_TOKEN,
} from './constants/rbac.tokens';

// Repositories (Step 2)
import { AbstractRoleRepository } from './repositories/abstract/role.repository.abstract';
import { AbstractPermissionRepository } from './repositories/abstract/permission.repository.abstract';
import { PostgresRoleRepository } from './repositories/postgres/postgres-role.repository';
import { PostgresPermissionRepository } from './repositories/postgres/postgres-permission.repository';

// Services (Step 3 — god-class decomposition)
import { RoleQueryService } from './services/role-query.service';
import { RoleCommandService } from './services/role-command.service';
import { PermissionQueryService } from './services/permission-query.service';
import { PermissionPolicyService } from './services/permission-policy.service';
import { RoleHierarchyResolverService } from './services/role-hierarchy-resolver.service';

// Lifecycle + cache (Step 3)
import { RbacSeederService } from './seed/rbac-seeder.service';
import { RedisPermissionCacheStore } from './cache/redis-permission-cache.store';

// Adapters
import { RbacPermissionCheckerAdapter } from './adapters/rbac-permission-checker.adapter';

/**
 * RBAC Module — SEALED PUBLIC SURFACE (Step 5)
 *
 * Dynamic role-based access control.
 *
 * Boundary contract
 * -----------------
 * External modules may ONLY inject the abstract ISP tokens listed in
 * `exports` below. The following are intentionally module-internal and
 * MUST NOT leak through any public surface:
 *
 *   - Concrete service classes (`RoleQueryService`,
 *     `RoleCommandService`, `PermissionPolicyService`,
 *     `PermissionQueryService`, `RoleHierarchyResolverService`,
 *     `RbacSeederService`, `RedisPermissionCacheStore`).
 *   - The persistence layer (`AbstractRoleRepository`,
 *     `AbstractPermissionRepository`, `Postgres*Repository`).
 *   - The TypeORM entities `Role` and `Permission`. These are
 *     persistence details. They are reachable only through the typed
 *     DTOs exposed on `IRoleQueryService` / `IPermissionQueryService`.
 *   - `TypeOrmModule.forFeature([Role, Permission])` — kept as a local
 *     `imports` entry so `Postgres*Repository` can resolve its typed
 *     repositories, but DELIBERATELY NOT re-exported. Without this
 *     export, no consumer can write `@InjectRepository(Role)` against
 *     the RBAC aggregate.
 *
 * The barrel `backend/src/rbac/index.ts` enforces the same contract at
 * the static-import layer: it re-exports only `interfaces/`, `ports/`,
 * and `constants/` — never `entities/`, `services/`, `repositories/`,
 * or this module class itself.
 *
 * Step history (1–4 recap)
 * ------------------------
 *  - Step 3 deleted the 769-line `RBACService` god-class. Its
 *    responsibilities were split across five focused services, each
 *    bound to one ISP token (see provider list below). The in-process
 *    `Map` permission cache was replaced by `RedisPermissionCacheStore`
 *    (`RBAC_PERMISSION_CACHE_TOKEN`) for cross-pod safety.
 *  - Step 4 relocated outbound ports into their owning modules:
 *      RBAC_AUDIT_EMITTER_TOKEN          → AuditLogsModule (@Global)
 *      MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN → MembershipModule (imported)
 *    The temporary `adapters/legacy/` directory was deleted.
 *
 * @Global() retention rationale
 * -----------------------------
 * Four consumer surfaces inject RBAC tokens today without an explicit
 * `imports: [RBACModule]` edge — they rely on the global registration:
 *   - `auth/casl/casl-ability.factory.ts`            (CaslModule)
 *   - `core/auth/guards/permissions.guard.ts`        (APP_GUARD)
 *   - `circuit-breaker/circuit-breaker.module.ts`    (PERMISSION_CHECKER_TOKEN)
 *   - `circuit-breaker/providers/circuit-breaker.control-plane.ts`
 * Demoting from `@Global()` today would require touching every one of
 * those modules and risks regressing the boot order for the global
 * permissions guard. Lockdown is therefore the export surface, not the
 * scope decorator.
 *
 * TODO: Demote from @Global and require explicit imports once each of
 * the four consumer modules above declares `imports: [RBACModule]`.
 */
@Global()
@Module({
  imports: [
    // forFeature kept LOCAL — Repository<Role|Permission> is needed by
    // the Postgres* repositories but is intentionally NOT re-exported.
    TypeOrmModule.forFeature([Role, Permission]),
    CacheModule,
    MembershipModule, // brings MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN into scope
  ],
  providers: [
    // Repositories (DIP)
    { provide: AbstractRoleRepository, useClass: PostgresRoleRepository },
    {
      provide: AbstractPermissionRepository,
      useClass: PostgresPermissionRepository,
    },

    // Hierarchy + cache (consumed by the policy surface)
    {
      provide: RBAC_ROLE_HIERARCHY_TOKEN,
      useClass: RoleHierarchyResolverService,
    },
    {
      provide: RBAC_PERMISSION_CACHE_TOKEN,
      useClass: RedisPermissionCacheStore,
    },

    // Hot-path authorization surface
    {
      provide: RBAC_PERMISSION_POLICY_TOKEN,
      useClass: PermissionPolicyService,
    },

    // Read-side projections
    { provide: RBAC_ROLE_QUERY_TOKEN, useClass: RoleQueryService },
    {
      provide: RBAC_PERMISSION_QUERY_TOKEN,
      useClass: PermissionQueryService,
    },

    // Write side (depends on outbound ports relocated in Step 4)
    { provide: RBAC_ROLE_COMMAND_TOKEN, useClass: RoleCommandService },

    // Bootstrap lifecycle
    { provide: RBAC_SEEDER_TOKEN, useClass: RbacSeederService },

    // Cross-cutting adapter for the circuit-breaker contract
    {
      provide: PERMISSION_CHECKER_TOKEN,
      useClass: RbacPermissionCheckerAdapter,
    },
  ],
  exports: [
    // SEALED public surface — abstract tokens only.
    RBAC_ROLE_QUERY_TOKEN,
    RBAC_ROLE_COMMAND_TOKEN,
    RBAC_PERMISSION_QUERY_TOKEN,
    RBAC_PERMISSION_POLICY_TOKEN,
    RBAC_ROLE_HIERARCHY_TOKEN,
    RBAC_PERMISSION_CACHE_TOKEN,
    RBAC_SEEDER_TOKEN,
    PERMISSION_CHECKER_TOKEN,
    // TypeOrmModule is intentionally NOT re-exported (Step 5 lockdown).
  ],
})
export class RBACModule {}
