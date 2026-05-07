import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from './entities/issue.entity';
import { IssueLink } from './entities/issue-link.entity';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';
// REMOVED: ProjectsModule import - using CoreEntitiesModule (global) for Project repository
// REMOVED: MembershipModule import - using ProjectCoreModule (global) for ProjectMembersService
// REMOVED: UsersModule import - using UsersCoreModule (global) for UsersService
// REMOVED: AuthModule import - guards are global via APP_GUARD
import { WorkLog } from './entities/work-log.entity';
import { WorkLogsService } from './issues.service';
import { CaslModule } from '../auth/casl/casl.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { Board } from '../boards/entities/board.entity';
import { TimerService } from './timer.service';
import { TimerController } from './timer.controller';
import { BillableTimeService } from './billable-time.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, WorkLog, IssueLink, Board]),
    // REFACTORED: All forwardRefs eliminated - using global core modules
    CaslModule,
    WorkflowsModule,
  ],
  providers: [
    IssuesService,
    WorkLogsService,
    TimerService,
    BillableTimeService,
  ],
  controllers: [IssuesController, TimerController],
  exports: [
    IssuesService,
    WorkLogsService,
    TimerService,
    BillableTimeService,
  ],
})
export class IssuesModule {}
