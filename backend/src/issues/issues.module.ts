import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssueLink } from './entities/issue-link.entity';
import { Project } from '../projects/entities/project.entity';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';
import { WorkLogsService } from './issues.service';
import { CaslModule } from '../auth/casl/casl.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { TimerService } from './timer.service';
import { TimerController } from './timer.controller';
import { BillableTimeService } from './billable-time.service';

import { CacheModule } from '../cache/cache.module';
@Module({
  imports: [
    // SOLID Refactor (Step 3): Tier-1 entities (Issue, WorkLog, Board) are now
    // exposed by the @Global DatabaseModule via abstract repository tokens.
    // Only non-Tier-1 entities and the tenant-wrapped Project remain local.
    TypeOrmModule.forFeature([IssueLink, Project]),
    CaslModule,
    WorkflowsModule,
    CacheModule,
  ],
  providers: [
    IssuesService,
    WorkLogsService,
    TimerService,
    BillableTimeService,
  ],
  controllers: [IssuesController, TimerController],
  exports: [IssuesService, WorkLogsService, TimerService, BillableTimeService],
})
export class IssuesModule {}
