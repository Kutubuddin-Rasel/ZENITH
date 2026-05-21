import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import {
  InvitesController,
  ProjectInvitesController,
} from './invites.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';

// Step 2 — Repository inversion (DIP).
import { AbstractInviteRepository } from './repositories/abstract/invite.repository.abstract';
import { PostgresInviteRepository } from './repositories/postgres/postgres-invite.repository';

// Step 3 — Decomposed services bound behind ISP tokens.
import { InviteQueryService } from './services/invite-query.service';
import { InviteCommandService } from './services/invite-command.service';
import { InvitePolicyService } from './services/invite-policy.service';
import { InviteTokenGeneratorService } from './services/invite-token-generator.service';
import {
  INVITE_COMMAND_TOKEN,
  INVITE_POLICY_TOKEN,
  INVITE_QUERY_TOKEN,
  INVITE_TOKEN_GENERATOR_TOKEN,
} from './constants/invites.tokens';

// Step 4 — Outbound port re-exported so external aggregates (today
// only `ProjectsModule`) can bind a concrete adapter without
// importing any module-internal symbol.
import { ProjectLookupPort } from './ports/project-lookup.port';

/**
 * Invites Module — SEALED PUBLIC SURFACE (Step 4)
 *
 * Owns the `invites` aggregate (project-onboarding entry point). Beyond
 * the HTTP controller surface, it publishes four ISP-segregated tokens
 * for external consumers (auth registration flow, projects dashboards,
 * future SSO) and one outbound port that lets external aggregates
 * satisfy the inverted dependency on `ProjectsService`:
 *
 *   - `INVITE_QUERY_TOKEN`            — read surface (`IInviteQuery`)
 *   - `INVITE_COMMAND_TOKEN`          — write surface (`IInviteCommand`)
 *   - `INVITE_POLICY_TOKEN`           — gating rules (`IInvitePolicy`)
 *   - `INVITE_TOKEN_GENERATOR_TOKEN`  — CSPRNG seam
 *                                       (`IInviteTokenGenerator`)
 *   - `ProjectLookupPort`             — outbound abstract; the binding
 *                                       (`ProjectLookupAdapter`) lives
 *                                       inside `ProjectsModule` so the
 *                                       cycle stays broken.
 *
 * Boundary contract
 * -----------------
 * External modules may ONLY inject the abstract tokens listed in
 * `exports` below. The following are intentionally module-internal and
 * MUST NOT leak through any public surface:
 *
 *   - Concrete service classes (`InviteQueryService`,
 *     `InviteCommandService`, `InvitePolicyService`,
 *     `InviteTokenGeneratorService`). The legacy `InvitesService`
 *     god-class was deleted in Step 3 and must never return.
 *   - The persistence layer (`AbstractInviteRepository`,
 *     `PostgresInviteRepository`).
 *   - The TypeORM entity `Invite`. This is a persistence detail. It is
 *     reachable only through the typed DTOs exposed on `IInviteQuery`
 *     / `IInviteCommand` (`InviteSummary`, `InviteWithRelations`,
 *     `BulkInviteResult`, etc.).
 *   - `TypeOrmModule.forFeature([Invite])` — kept as a local `imports`
 *     entry so `PostgresInviteRepository` can resolve its typed
 *     repository, but DELIBERATELY NOT re-exported. Without this
 *     export no consumer can write `@InjectRepository(Invite)` against
 *     the invites aggregate.
 *   - HTTP controllers (`InvitesController`, `ProjectInvitesController`)
 *     and DTOs — these are transport, not injectable contracts.
 *
 * The barrel `backend/src/invites/index.ts` enforces the same contract
 * at the static-import layer: it re-exports only `interfaces/`,
 * `constants/`, `enums/`, `events/`, and `ports/` — never `entities/`,
 * `services/`, `repositories/`, `controllers/`, or this module class
 * itself.
 *
 * Cycle elimination (recap from Step 3)
 * -------------------------------------
 * The legacy `forwardRef(() => ProjectsModule)` import existed only so
 * the god-class could hydrate event payloads via concrete
 * `ProjectsService`. The replacement is the outbound `ProjectLookupPort`
 * consumed by `InviteCommandService`; its concrete adapter
 * (`ProjectLookupAdapter`) is bound INSIDE `ProjectsModule` and
 * re-exported, so `imports: [ProjectsModule]` is now a one-way edge
 * with no cycle.
 *
 * @Global() rationale
 * ------------------
 * NOT marked `@Global()`. Invites has only two consumers
 * (`AuthCoreModule` for `redeemInvite`, `ProjectsModule` for
 * `getInvites`); explicit `imports: [InvitesModule]` is cleaner than
 * a global token surface and keeps the dependency graph visible.
 *
 * Step history (1–3 recap)
 * ------------------------
 *  - Step 1 created the four ISP tokens + interfaces, typed event DTOs,
 *    and the outbound `ProjectLookupPort`.
 *  - Step 2 inverted the repository (`AbstractInviteRepository` +
 *    `PostgresInviteRepository`), moved the `DataSource` queryRunner
 *    into the repository, and removed `@InjectRepository(Invite)` from
 *    the legacy service.
 *  - Step 3 deleted the 332-line `InvitesService` god-class. The
 *    responsibilities were split across four focused services bound to
 *    one ISP token each (see provider list below). The notifications
 *    listener migrated onto DTO payloads; `ProjectsService` and
 *    `RegistrationService` migrated onto `INVITE_QUERY_TOKEN` /
 *    `INVITE_COMMAND_TOKEN`. The `forwardRef(() => ProjectsModule)`
 *    cycle was replaced with the outbound port adapter.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Invite]),
    UsersModule,
    NotificationsModule,
    // One-way edge: invites depends on projects for the outbound
    // `ProjectLookupPort` binding. `ProjectsModule` no longer depends
    // back on InvitesModule (the legacy forwardRef cycle is gone).
    ProjectsModule,
  ],
  providers: [
    // DIP — abstract repository bound to the Postgres implementation.
    {
      provide: AbstractInviteRepository,
      useClass: PostgresInviteRepository,
    },

    // ISP — decomposed services bound behind their own tokens.
    { provide: INVITE_QUERY_TOKEN, useClass: InviteQueryService },
    { provide: INVITE_COMMAND_TOKEN, useClass: InviteCommandService },
    { provide: INVITE_POLICY_TOKEN, useClass: InvitePolicyService },
    {
      provide: INVITE_TOKEN_GENERATOR_TOKEN,
      useClass: InviteTokenGeneratorService,
    },
  ],
  controllers: [InvitesController, ProjectInvitesController],
  exports: [
    // ISP token surface — abstract bindings only. The concrete
    // `InvitesService` god-class was deleted in Step 3 and must never
    // appear here again.
    INVITE_QUERY_TOKEN,
    INVITE_COMMAND_TOKEN,
    INVITE_POLICY_TOKEN,
    INVITE_TOKEN_GENERATOR_TOKEN,
    // Outbound port consumed by `InviteCommandService`; bound to
    // `ProjectLookupAdapter` inside `ProjectsModule`. Re-exported so
    // any future external binding sees the same abstract token.
    ProjectLookupPort,
    // TypeOrmModule is intentionally NOT re-exported — `Invite`
    // persistence is sealed inside this module.
  ],
})
export class InvitesModule {}
