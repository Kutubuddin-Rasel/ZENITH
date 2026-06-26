// src/backlog/backlog.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuesModule } from '../issues/issues.module';
import { BacklogController } from './backlog.controller';
import { Issue } from '../issues/entities/issue.entity';
import { SprintIssue } from '../sprints/entities/sprint-issue.entity';
import {
  BACKLOG_QUERY_TOKEN,
  BACKLOG_ORDERING_TOKEN,
} from './constants/backlog.tokens';
import { BacklogReadRepository } from './repositories/abstract/backlog-read.repository.abstract';
import { TypeOrmBacklogReadRepository } from './repositories/typeorm/typeorm-backlog-read.repository';
import { BacklogQueryService } from './services/backlog-query.service';
import { BacklogOrderingService } from './services/backlog-ordering.service';
import { BacklogCacheService } from './services/backlog-cache.service';

/**
 * SOLID Refactor (Step 3 COMPLETE) — decomposed CQRS module.
 *
 * The legacy `BacklogService` (which held a raw `Repository<Issue>` and wrote
 * the Issue aggregate directly) has been DELETED. Its responsibilities are
 * split across:
 *
 *   - `BacklogQueryService`     → `BACKLOG_QUERY_TOKEN`     (cached read)
 *   - `BacklogOrderingService`  → `BACKLOG_ORDERING_TOKEN`  (delegated writes)
 *   - `BacklogCacheService`     — internal cache concern (not bound to a token)
 *   - `BacklogReadRepository`   — backlog-owned read projection (DIP)
 *
 * Every Issue-row write now flows through the issues aggregate's
 * `ISSUE_RANKING_TOKEN` (provided by `IssuesModule`), restoring the
 * single-writer invariant. `SprintIssue` backs the projection's membership
 * join; `Issue` backs the read adapter's `@InjectRepository`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, SprintIssue]),
    // REFACTORED: Direct import since cycles are broken. Supplies
    // `ISSUE_RANKING_TOKEN` (the single writer of `Issue.backlogOrder`).
    IssuesModule,
  ],
  providers: [
    BacklogQueryService,
    BacklogOrderingService,
    BacklogCacheService,
    { provide: BacklogReadRepository, useClass: TypeOrmBacklogReadRepository },
    // ISP tokens now resolve to the decomposed CQRS services.
    { provide: BACKLOG_QUERY_TOKEN, useExisting: BacklogQueryService },
    { provide: BACKLOG_ORDERING_TOKEN, useExisting: BacklogOrderingService },
  ],
  controllers: [BacklogController],
})
export class BacklogModule {}
