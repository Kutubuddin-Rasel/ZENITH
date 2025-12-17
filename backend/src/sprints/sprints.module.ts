import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { SprintIssue } from './entities/sprint-issue.entity';
import { SprintSnapshot } from './entities/sprint-snapshot.entity';
import { SprintsService } from './sprints.service';
import { SprintsCron } from './sprints.cron';
import { SprintsController } from './sprints.controller';
// REMOVED: ProjectsModule import - using CoreEntitiesModule (global) for Project repository
import { IssuesModule } from '../issues/issues.module';
// REMOVED: MembershipModule import - using ProjectCoreModule (global) for ProjectMembersService
import { WatchersModule } from '../watchers/watchers.module';
import { BoardsModule } from '../boards/boards.module';
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, SprintIssue, SprintSnapshot]),
    // REFACTORED: All forwardRefs eliminated - direct imports since cycles are broken
    IssuesModule,
    WatchersModule,
    BoardsModule,
    UserPreferencesModule,
  ],
  providers: [SprintsService, SprintsCron],
  controllers: [SprintsController],
  exports: [SprintsService],
})
export class SprintsModule { }
