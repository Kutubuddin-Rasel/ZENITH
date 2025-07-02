import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from './entities/issue.entity';
import { IssuesService } from './issues.service';
import { IssuesController } from './issues.controller';
import { ProjectsModule } from '../projects/projects.module';
import { MembershipModule } from '../membership/membership.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { WorkLog } from './entities/work-log.entity';
import { WorkLogsService } from './issues.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, WorkLog]),
    forwardRef(() => ProjectsModule),
    forwardRef(() => MembershipModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  providers: [IssuesService, WorkLogsService],
  controllers: [IssuesController],
  exports: [IssuesService, WorkLogsService],
})
export class IssuesModule {}
