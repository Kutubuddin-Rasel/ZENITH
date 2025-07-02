// src/releases/releases.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from './entities/release.entity';
import { IssueRelease } from './entities/issue-release.entity';
import { ReleasesService } from './releases.service';
import { ReleasesController } from './releases.controller';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
import { MembershipModule } from '../membership/membership.module';
import { WatchersModule } from '../watchers/watchers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Release, IssueRelease]),
    forwardRef(() => ProjectsModule),
    forwardRef(() => IssuesModule),
    MembershipModule,
    forwardRef(() => WatchersModule),
  ],
  providers: [ReleasesService],
  controllers: [ReleasesController],
  exports: [ReleasesService],
})
export class ReleasesModule {}
