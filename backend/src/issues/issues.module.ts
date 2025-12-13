import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from './entities/issue.entity';
import { IssueLink } from './entities/issue-link.entity';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';
import { ProjectsModule } from '../projects/projects.module';
import { MembershipModule } from '../membership/membership.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { WorkLog } from './entities/work-log.entity';
import { WorkLogsService } from './issues.service';
import { CaslModule } from '../auth/casl/casl.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, WorkLog, IssueLink]),
    forwardRef(() => ProjectsModule),
    forwardRef(() => MembershipModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    CaslModule,
    WorkflowsModule,
  ],
  providers: [IssuesService, WorkLogsService],
  controllers: [IssuesController],
  exports: [IssuesService, WorkLogsService],
})
export class IssuesModule {}
