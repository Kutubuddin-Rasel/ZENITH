// src/releases/releases.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Release } from './entities/release.entity';
import { IssueRelease } from './entities/issue-release.entity';
import { ReleaseAttachment } from './entities/release-attachment.entity';
import { DeploymentWebhook } from './entities/deployment-webhook.entity';
import { ReleasesService } from './releases.service';
import { ReleasesController } from './releases.controller';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { WatchersModule } from '../watchers/watchers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Release,
      IssueRelease,
      ReleaseAttachment,
      DeploymentWebhook,
    ]),
    MulterModule.register({
      dest: './uploads/releases',
    }),
    // REFACTORED: Direct imports since cycles are broken
    ProjectsModule,
    IssuesModule,
    WatchersModule,
  ],
  providers: [ReleasesService],
  controllers: [ReleasesController],
  exports: [ReleasesService],
})
export class ReleasesModule {}
