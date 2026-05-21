import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectMembersController } from './project-members/project-members.controller';
import { UserProjectMembershipsController } from './controllers/user-project-memberships.controller';
import { MembershipRoleUsageProbeAdapter } from './adapters/membership-role-usage-probe.adapter';
import { AuditLogsModule } from '../audit/audit-logs.module';
import { CsrfModule } from '../security/csrf/csrf.module';
import { MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN } from '../rbac';

// Step 2 — Repository inversion (DIP)
import { AbstractProjectMemberRepository } from './repositories/abstract/project-member.repository.abstract';
import { PostgresProjectMemberRepository } from './repositories/postgres/postgres-project-member.repository';

// Step 2/3 — ISP token surface
import { ProjectMemberQueryService } from './services/project-member-query.service';
import { ProjectMemberCommandService } from './services/project-member-command.service';
import { ProjectMemberPolicyService } from './services/project-member-policy.service';
import {
  PROJECT_MEMBER_COMMAND_TOKEN,
  PROJECT_MEMBER_POLICY_TOKEN,
  PROJECT_MEMBER_QUERY_TOKEN,
} from './constants/membership.tokens';

/**
 * Membership Module — SEALED PUBLIC SURFACE (Step 4)
 *
 * Owns the `project_members` aggregate (the relational glue between
 * users, projects, and roles). Beyond the controller surface, it
 * satisfies the outbound RBAC port `IMembershipRoleUsageProbe` by
 * binding `MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN` →
 * `MembershipRoleUsageProbeAdapter`. RBAC consumes that binding through
 * a normal `imports: [MembershipModule]` edge in `RBACModule`.
 *
 * Boundary contract
 * -----------------
 * External modules may ONLY inject the abstract ISP tokens listed in
 * `exports` below. The following are intentionally module-internal and
 * MUST NOT leak through any public surface:
 *
 *   - Concrete service classes (`ProjectMemberQueryService`,
 *     `ProjectMemberCommandService`, `ProjectMemberPolicyService`,
 *     `MembershipRoleUsageProbeAdapter`).
 *   - The persistence layer (`AbstractProjectMemberRepository`,
 *     `PostgresProjectMemberRepository`).
 *   - The TypeORM entity `ProjectMember`. This is a persistence detail.
 *     It is reachable only through the typed DTOs exposed on
 *     `IProjectMemberQuery` / `IProjectMemberCommand`
 *     (`ProjectMemberSummary`, `ProjectMemberWithUser`,
 *     `ProjectMemberRoleDetails`, `UserMembership`).
 *   - `TypeOrmModule.forFeature([ProjectMember])` — kept as a local
 *     `imports` entry so `PostgresProjectMemberRepository` can resolve
 *     its typed repository, but DELIBERATELY NOT re-exported. Without
 *     this export, no consumer can write `@InjectRepository(ProjectMember)`
 *     against the membership aggregate.
 *
 * The barrel `backend/src/membership/index.ts` enforces the same
 * contract at the static-import layer: it re-exports only `interfaces/`,
 * `constants/`, `enums/`, and `events/` — never `entities/`,
 * `services/`, `repositories/`, `adapters/`, or this module class
 * itself.
 *
 * Step history (1–3 recap)
 * ------------------------
 *  - Step 1 defined the three ISP tokens (`PROJECT_MEMBER_QUERY_TOKEN`,
 *    `PROJECT_MEMBER_COMMAND_TOKEN`, `PROJECT_MEMBER_POLICY_TOKEN`) and
 *    their interfaces.
 *  - Step 2 inverted the repository (`AbstractProjectMemberRepository`
 *    + `PostgresProjectMemberRepository`), stripped the cross-aggregate
 *    `@ManyToOne(() => Role)` from `ProjectMember`, and removed the
 *    illegal `@InjectRepository(ProjectMember)` site in
 *    `reports/processors/scheduled-reports.processor.ts`.
 *  - Step 3 deleted the 434-line `ProjectMembersService` god-class and
 *    its `role-hierarchy.ts` helper. The responsibilities were split
 *    across three focused services bound to one ISP token each (see
 *    provider list below). The temporary `core/membership/project-core.module.ts`
 *    workaround was deleted alongside.
 *
 * @Global() retention rationale
 * -----------------------------
 * Marking this module `@Global()` keeps the token surface reachable
 * from guards (CASL, project-role, permissions) and 17+ domain
 * services without re-introducing the
 * `AuthModule → MembershipModule → [domain module] → AuthModule`
 * dependency cycle that the legacy `ProjectCoreModule` originally
 * worked around. Lockdown therefore lives in `exports` (abstract
 * tokens only), not the scope decorator.
 *
 * TODO: Demote from `@Global()` once each consumer module declares
 * `imports: [MembershipModule]` explicitly.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectMember]),
    EventEmitterModule.forRoot(), // EventEmitter2 DI
    AuditLogsModule, // AuditLogsService DI
    CsrfModule, // CsrfGuard DI for @RequireCsrf()
  ],
  providers: [
    // DIP — abstract repository bound to the Postgres implementation.
    {
      provide: AbstractProjectMemberRepository,
      useClass: PostgresProjectMemberRepository,
    },

    // ISP — decomposed services bound behind their own tokens.
    {
      provide: PROJECT_MEMBER_QUERY_TOKEN,
      useClass: ProjectMemberQueryService,
    },
    {
      provide: PROJECT_MEMBER_COMMAND_TOKEN,
      useClass: ProjectMemberCommandService,
    },
    {
      provide: PROJECT_MEMBER_POLICY_TOKEN,
      useClass: ProjectMemberPolicyService,
    },

    // Outbound port to RBAC
    {
      provide: MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN,
      useClass: MembershipRoleUsageProbeAdapter,
    },
  ],
  controllers: [
    ProjectMembersController,
    // Step 6 — relocated from UsersController.
    UserProjectMembershipsController,
  ],
  exports: [
    // ISP token surface — abstract bindings only.
    PROJECT_MEMBER_QUERY_TOKEN,
    PROJECT_MEMBER_COMMAND_TOKEN,
    PROJECT_MEMBER_POLICY_TOKEN,
    // Outbound port consumed by RBAC's RoleCommandService.
    MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN,
    // TypeOrmModule is intentionally NOT re-exported — `ProjectMember`
    // persistence is sealed inside this module.
  ],
})
export class MembershipModule {}
