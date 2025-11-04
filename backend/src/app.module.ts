import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { InvitesModule } from './invites/invites.module';
import { MembershipModule } from './membership/membership.module';
import { ProjectsModule } from './projects/projects.module';
import { IssuesModule } from './issues/issues.module';
import { SprintsModule } from './sprints/sprints.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { BoardsModule } from './boards/boards.module';
import { ReleasesModule } from './releases/releases.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { EpicsModule } from './epics/epics.module';
import { BacklogModule } from './backlog/backlog.module';
import { WatchersModule } from './watchers/watchers.module';
import { RevisionsModule } from './revisions/revisions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { EncryptionModule } from './encryption/encryption.module';
import { SessionModule } from './session/session.module';
import { AccessControlModule } from './access-control/access-control.module';
import { CacheModule } from './cache/cache.module';
import { DatabaseModule } from './database/database.module';
import { PerformanceModule } from './performance/performance.module';
import { ProjectTemplatesModule } from './project-templates/project-templates.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SatisfactionModule } from './satisfaction/satisfaction.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ResourceManagementModule } from './resource-management/resource-management.module';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { createDatabaseConfig } from './database/config/database.config';

@Module({
  imports: [
    // Load .env file and make ConfigService available
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Configure TypeORM asynchronously using ConfigService with optimizations
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createDatabaseConfig,
    }),
    CacheModule,
    DatabaseModule,
    PerformanceModule,
    UsersModule,
    AuthModule,
    InvitesModule,
    MembershipModule,
    ProjectsModule,
    IssuesModule,
    SprintsModule,
    CommentsModule,
    AttachmentsModule,
    BoardsModule,
    ReleasesModule,
    TaxonomyModule,
    EpicsModule,
    BacklogModule,
    WatchersModule,
    RevisionsModule,
    NotificationsModule,
    ReportsModule,
    AuditModule,
    EncryptionModule,
    SessionModule,
    AccessControlModule,
    ProjectTemplatesModule,
    UserPreferencesModule,
    OnboardingModule,
    SatisfactionModule,
    WorkflowsModule,
    IntegrationsModule,
    ResourceManagementModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
