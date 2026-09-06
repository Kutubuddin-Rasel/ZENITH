// src/releases/releases.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Release } from './entities/release.entity';
import { IssueRelease } from './entities/issue-release.entity';
import { ReleaseAttachment } from './entities/release-attachment.entity';
import { DeploymentWebhook } from './entities/deployment-webhook.entity';
import { ReleasesController } from './releases.controller';
import {
  RELEASE_QUERY_TOKEN,
  RELEASE_COMMAND_TOKEN,
  RELEASE_DEPLOYMENT_TOKEN,
  RELEASE_NOTES_TOKEN,
  RELEASE_REPOSITORY_TOKEN,
} from './constants/releases.tokens';
import { PostgresReleaseRepository } from './repositories/postgres/postgres-release.repository';
import { ReleaseNotificationPort } from './ports/release-notification.port';
import { ReleaseQueryService } from './services/release-query.service';
import { ReleaseCommandService } from './services/release-command.service';
import { ReleaseDeploymentService } from './services/release-deployment.service';
import { ReleaseNotesService } from './services/release-notes.service';
import { ProjectsModule } from '../projects/projects.module';
import { IssuesModule } from '../issues/issues.module';
import { WatchersModule } from '../watchers/watchers.module';
import { WatchersService } from '../watchers/watchers.service';

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
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file (release artifacts/build files)
        files: 10, // Max 10 files per request
      },
    }),
    // REFACTORED: Direct imports since cycles are broken
    ProjectsModule,
    IssuesModule,
    WatchersModule,
  ],
  providers: [
    // CQRS services — each implements one ISP surface, depends only on
    // abstractions (repo token, ports, domain tokens). No @InjectRepository.
    ReleaseQueryService,
    ReleaseCommandService,
    ReleaseDeploymentService,
    ReleaseNotesService,
    // Token bindings: consumers (controller, external modules) speak tokens.
    { provide: RELEASE_QUERY_TOKEN, useExisting: ReleaseQueryService },
    { provide: RELEASE_COMMAND_TOKEN, useExisting: ReleaseCommandService },
    {
      provide: RELEASE_DEPLOYMENT_TOKEN,
      useExisting: ReleaseDeploymentService,
    },
    { provide: RELEASE_NOTES_TOKEN, useExisting: ReleaseNotesService },
    // Persistence isolated behind the repo token; watcher notifications behind
    // the outbound port. AuditPort is @Global (AuditLogsModule) — injected
    // directly by the command/deployment services, no binding here.
    { provide: RELEASE_REPOSITORY_TOKEN, useClass: PostgresReleaseRepository },
    { provide: ReleaseNotificationPort, useExisting: WatchersService },
  ],
  controllers: [ReleasesController],
  exports: [
    RELEASE_QUERY_TOKEN,
    RELEASE_COMMAND_TOKEN,
    RELEASE_DEPLOYMENT_TOKEN,
    RELEASE_NOTES_TOKEN,
  ],
})
export class ReleasesModule {}
