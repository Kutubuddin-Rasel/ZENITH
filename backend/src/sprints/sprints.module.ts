import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { SprintIssue } from './entities/sprint-issue.entity';
import { SprintSnapshot } from './entities/sprint-snapshot.entity';
import { SprintsCron } from './sprints.cron';
import { SprintsController } from './sprints.controller';
// REMOVED: ProjectsModule import - using CoreEntitiesModule (global) for Project repository
import { IssuesModule } from '../issues/issues.module';
import { WatchersModule } from '../watchers/watchers.module';
import { BoardsModule } from '../boards/boards.module';
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';

import { CacheModule } from '../cache/cache.module';
import { CommonEventsModule } from '../common/submodules/events.module';
import {
  SPRINT_QUERY_TOKEN,
  SPRINT_COMMAND_TOKEN,
  SPRINT_LIFECYCLE_TOKEN,
  SPRINT_MEMBERSHIP_TOKEN,
  SPRINT_METRICS_TOKEN,
  SPRINT_SNAPSHOT_TOKEN,
} from './constants/sprints.tokens';
// SOLID Refactor (Step 2): TypeORM inverted behind abstract-class-as-token
// repositories + an outbound ProjectLookupPort. The Postgres impls are the
// ONLY classes allowed to inject TypeORM repositories / build QueryBuilders.
import { AbstractSprintRepository } from './repositories/abstract/sprint.repository.abstract';
import { AbstractSprintSnapshotRepository } from './repositories/abstract/sprint-snapshot.repository.abstract';
import { PostgresSprintRepository } from './repositories/postgres/postgres-sprint.repository';
import { PostgresSprintSnapshotRepository } from './repositories/postgres/postgres-sprint-snapshot.repository';
import { ProjectLookupPort } from './ports/project-lookup.port';
import { PostgresProjectLookupAdapter } from './adapters/postgres-project-lookup.adapter';
// SOLID Refactor (Step 4): the decomposed CQRS services own every ISP
// surface. The legacy `SprintsService` god class has been DELETED; the
// cron now injects `SPRINT_SNAPSHOT_TOKEN` and the 7 external consumers
// inject the narrow tokens through the sealed barrel.
import { SprintQueryService } from './services/sprint-query.service';
import { SprintCommandService } from './services/sprint-command.service';
import { SprintLifecycleService } from './services/sprint-lifecycle.service';
import { SprintMembershipService } from './services/sprint-membership.service';
import { SprintAnalyticsService } from './services/sprint-analytics.service';
import { SprintSnapshotService } from './services/sprint-snapshot.service';

/**
 * CQRS bindings (Step 3): each ISP token now resolves to its dedicated
 * decomposed service (was `useExisting: SprintsService` in Step 1). The
 * swap is invisible to consumers — they inject the same token and the
 * same interface. `SPRINT_METRICS_TOKEN → SprintAnalyticsService` keeps
 * the read-heavy analytics surface isolated for the future ClickHouse
 * swap (Directive B); `SPRINT_SNAPSHOT_TOKEN → SprintSnapshotService`
 * retires the legacy `findAllActiveSystemWide_UNSAFE` smell.
 */
const SPRINT_CQRS_BINDINGS = [
  { provide: SPRINT_QUERY_TOKEN, useExisting: SprintQueryService },
  { provide: SPRINT_COMMAND_TOKEN, useExisting: SprintCommandService },
  { provide: SPRINT_LIFECYCLE_TOKEN, useExisting: SprintLifecycleService },
  { provide: SPRINT_MEMBERSHIP_TOKEN, useExisting: SprintMembershipService },
  { provide: SPRINT_METRICS_TOKEN, useExisting: SprintAnalyticsService },
  { provide: SPRINT_SNAPSHOT_TOKEN, useExisting: SprintSnapshotService },
];

/** The concrete decomposed services registered for DI resolution. */
const SPRINT_CQRS_SERVICES = [
  SprintQueryService,
  SprintCommandService,
  SprintLifecycleService,
  SprintMembershipService,
  SprintAnalyticsService,
  SprintSnapshotService,
];

/**
 * DIP bindings (Step 2): every abstract repository / port resolves to
 * its Postgres implementation. Consumers depend on the abstraction, so
 * the persistence/transaction strategy is swappable (e.g. the snapshot
 * repo → ClickHouse in Level 5) without touching sprint domain logic.
 */
const SPRINT_REPOSITORY_BINDINGS = [
  { provide: AbstractSprintRepository, useClass: PostgresSprintRepository },
  {
    provide: AbstractSprintSnapshotRepository,
    useClass: PostgresSprintSnapshotRepository,
  },
  { provide: ProjectLookupPort, useClass: PostgresProjectLookupAdapter },
];

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, SprintIssue, SprintSnapshot]),
    // REFACTORED: All forwardRefs eliminated - direct imports since cycles are broken
    IssuesModule,
    WatchersModule,
    BoardsModule,
    UserPreferencesModule,
    CacheModule,
    CommonEventsModule,
  ],
  providers: [
    SprintsCron,
    ...SPRINT_CQRS_SERVICES,
    ...SPRINT_REPOSITORY_BINDINGS,
    ...SPRINT_CQRS_BINDINGS,
  ],
  controllers: [SprintsController],
  exports: [
    SPRINT_QUERY_TOKEN,
    SPRINT_COMMAND_TOKEN,
    SPRINT_LIFECYCLE_TOKEN,
    SPRINT_MEMBERSHIP_TOKEN,
    SPRINT_METRICS_TOKEN,
    SPRINT_SNAPSHOT_TOKEN,
  ],
})
export class SprintsModule {}
