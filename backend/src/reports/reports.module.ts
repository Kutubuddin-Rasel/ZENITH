import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SprintsModule } from 'src/sprints/sprints.module';
import { IssuesModule } from 'src/issues/issues.module';
import { AuthModule } from 'src/auth/auth.module';
import { RevisionsModule } from 'src/revisions/revisions.module';
import { MembershipModule } from 'src/membership/membership.module';
import { EpicsModule } from 'src/epics/epics.module';

@Module({
  imports: [SprintsModule, IssuesModule, AuthModule, RevisionsModule, MembershipModule, EpicsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
