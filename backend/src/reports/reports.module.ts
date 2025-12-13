import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SprintsModule } from 'src/sprints/sprints.module';
import { AuthModule } from 'src/auth/auth.module';
import { RevisionsModule } from 'src/revisions/revisions.module';
import { MembershipModule } from 'src/membership/membership.module';
import { Issue } from 'src/issues/entities/issue.entity';
import { SprintIssue } from 'src/sprints/entities/sprint-issue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, SprintIssue]),
    SprintsModule,
    AuthModule,
    RevisionsModule,
    MembershipModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
