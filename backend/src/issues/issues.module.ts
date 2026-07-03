import { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/entities/project.entity';
import { IssuesController } from './issues.controller';
import { CaslModule } from '../auth/casl/casl.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TimerService } from './timer.service';
import { TimerController } from './timer.controller';
import { BillableTimeService } from './billable-time.service';

import { CacheModule } from '../cache/cache.module';
import { CommonEventsModule } from '../common/submodules/events.module';

// SOLID Refactor (Step 3): decomposed CQRS services + shared helpers.
import { IssueAuthzService } from './services/issue-authz.service';
import { IssueKeyService } from './services/issue-key.service';
import { IssueQueryService } from './services/issue-query.service';
import { IssueCommandService } from './services/issue-command.service';
import { IssueTransitionService } from './services/issue-transition.service';
import { IssueAssignmentService } from './services/issue-assignment.service';
import { IssueLinkService } from './services/issue-link.service';
import { IssueImportService } from './services/issue-import.service';
import { WorklogQueryService } from './services/worklog-query.service';
import { WorklogCommandService } from './services/worklog-command.service';
// Backlog refactor (Step 2): single-writer of `Issue.backlogOrder`.
import { IssueRankingService } from './services/issue-ranking.service';

import {
  BILLABLE_TIME_TOKEN,
  ISSUE_ASSIGNMENT_TOKEN,
  ISSUE_COMMAND_TOKEN,
  ISSUE_IMPORT_TOKEN,
  ISSUE_LINK_TOKEN,
  ISSUE_QUERY_TOKEN,
  ISSUE_RANKING_TOKEN,
  ISSUE_TRANSITION_TOKEN,
  TIMER_TOKEN,
  WORKLOG_COMMAND_TOKEN,
  WORKLOG_QUERY_TOKEN,
} from './constants/issues.tokens';

/**
 * SOLID Refactor (Step 4 COMPLETE) — sealed CQRS module.
 *
 * The 1386-line `IssuesService` god class (and its co-located
 * `WorkLogsService`) has been DELETED. Every capability is now served by
 * focused, single-responsibility services bound behind the ISP tokens:
 *
 *   - `IssueQueryService`       → `ISSUE_QUERY_TOKEN`
 *   - `IssueCommandService`     → `ISSUE_COMMAND_TOKEN`
 *   - `IssueTransitionService`  → `ISSUE_TRANSITION_TOKEN`  (ACID home)
 *   - `IssueAssignmentService`  → `ISSUE_ASSIGNMENT_TOKEN`
 *   - `IssueLinkService`        → `ISSUE_LINK_TOKEN`
 *   - `IssueImportService`      → `ISSUE_IMPORT_TOKEN`
 *   - `WorklogQueryService`     → `WORKLOG_QUERY_TOKEN`
 *   - `WorklogCommandService`   → `WORKLOG_COMMAND_TOKEN`
 *   - `IssueAuthzService` / `IssueKeyService` — shared helpers
 *
 * The 10 former deep-import consumers (comments, sprints, releases,
 * dashboard, jira/github/slack integrations, taxonomy, telemetry,
 * attachments) now inject the narrow tokens via the sealed barrel
 * (`issues/index.ts`); the `no-restricted-imports` boundary lint
 * (`ISSUES_DEEP_IMPORT_PATTERNS` in `eslint.config.mjs`) bans any new deep
 * path into the module internals. In-module, `TimerService` consumes
 * `WorklogCommandService` directly (concrete intra-module wiring) and the
 * export/import controllers inject `ISSUE_QUERY_TOKEN`/`ISSUE_IMPORT_TOKEN`.
 */
const TOKEN_PROVIDERS: Provider[] = [
  { provide: ISSUE_QUERY_TOKEN, useExisting: IssueQueryService },
  { provide: ISSUE_COMMAND_TOKEN, useExisting: IssueCommandService },
  { provide: ISSUE_TRANSITION_TOKEN, useExisting: IssueTransitionService },
  { provide: ISSUE_ASSIGNMENT_TOKEN, useExisting: IssueAssignmentService },
  { provide: ISSUE_LINK_TOKEN, useExisting: IssueLinkService },
  { provide: ISSUE_IMPORT_TOKEN, useExisting: IssueImportService },
  // Backlog ordering delegates here (BACKLOG_ORDERING_TOKEN → this).
  { provide: ISSUE_RANKING_TOKEN, useExisting: IssueRankingService },
  { provide: WORKLOG_QUERY_TOKEN, useExisting: WorklogQueryService },
  { provide: WORKLOG_COMMAND_TOKEN, useExisting: WorklogCommandService },
  { provide: TIMER_TOKEN, useExisting: TimerService },
  { provide: BILLABLE_TIME_TOKEN, useExisting: BillableTimeService },
];

@Module({
  imports: [
    // SOLID Refactor (Step 2): Tier-1 entities (Issue, IssueLink, WorkLog,
    // Board) are now exposed by the @Global DatabaseModule via abstract
    // repository tokens. Only the tenant-wrapped Project remains local.
    TypeOrmModule.forFeature([Project]),
    CaslModule,
    WorkflowsModule,
    CacheModule,
    CommonEventsModule,
  ],
  providers: [
    // Decomposed CQRS surface (Step 3) — the real implementations.
    IssueAuthzService,
    IssueKeyService,
    IssueQueryService,
    IssueCommandService,
    IssueTransitionService,
    IssueAssignmentService,
    IssueLinkService,
    IssueImportService,
    IssueRankingService,
    WorklogQueryService,
    WorklogCommandService,
    // Time-tracking services (bound to TIMER/BILLABLE tokens).
    TimerService,
    BillableTimeService,
    ...TOKEN_PROVIDERS,
  ],
  controllers: [IssuesController, TimerController],
  exports: [
    // ISP tokens — the sealed public surface (consumers inject these via
    // the `issues/index.ts` barrel). No concrete service is exported.
    ISSUE_QUERY_TOKEN,
    ISSUE_COMMAND_TOKEN,
    ISSUE_TRANSITION_TOKEN,
    ISSUE_ASSIGNMENT_TOKEN,
    ISSUE_LINK_TOKEN,
    ISSUE_IMPORT_TOKEN,
    ISSUE_RANKING_TOKEN,
    WORKLOG_QUERY_TOKEN,
    WORKLOG_COMMAND_TOKEN,
    TIMER_TOKEN,
    BILLABLE_TIME_TOKEN,
  ],
})
export class IssuesModule {}
