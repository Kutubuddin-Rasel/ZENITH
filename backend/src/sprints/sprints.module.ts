import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sprint } from './entities/sprint.entity';
import { SprintIssue } from './entities/sprint-issue.entity';
import { SprintSnapshot } from './entities/sprint-snapshot.entity';
import { SprintsService } from './sprints.service';
import { SprintsCron } from './sprints.cron';
import { SprintsController } from './sprints.controller';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
import { MembershipModule } from '../membership/membership.module'; // <-- this name must match
import { WatchersModule } from '../watchers/watchers.module';
import { BoardsModule } from '../boards/boards.module';
import { UsersModule } from '../users/users.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sprint, SprintIssue, SprintSnapshot]),
    forwardRef(() => ProjectsModule),
    forwardRef(() => IssuesModule),
    forwardRef(() => MembershipModule), // <<<<<< import here
    forwardRef(() => WatchersModule),
    forwardRef(() => BoardsModule),
    UsersModule,
    forwardRef(() => UserPreferencesModule),
  ],
  providers: [SprintsService, SprintsCron],
  controllers: [SprintsController],
  exports: [SprintsService],
})
export class SprintsModule {}
