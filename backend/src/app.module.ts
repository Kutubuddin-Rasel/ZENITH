import { Module, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ModuleRef, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
// Core Infrastructure Modules
import { CoreEntitiesModule } from './core/entities/core-entities.module';
import { ProjectCoreModule } from './core/membership/project-core.module';
import { UsersCoreModule } from './core/users/users-core.module';
import { AuthCoreModule } from './core/auth/auth-core.module';
import { TenantModule } from './core/tenant/tenant.module';
import { CircuitBreakerModule } from './core/integrations/circuit-breaker.module';
import { TenantInterceptor } from './core/tenant/tenant.interceptor';
import { OptimisticLockingInterceptor } from './core/interceptors/optimistic-locking.interceptor';
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
import { BacklogModule } from './backlog/backlog.module';
import { WatchersModule } from './watchers/watchers.module';
import { RevisionsModule } from './revisions/revisions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { AuditLogsModule } from './audit/audit-logs.module';
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
// MOVED: JwtAuthGuard, PermissionsGuard now in AuthCoreModule
import { createDatabaseConfig } from './database/config/database.config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CommonModule } from './common/common.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { RagModule } from './rag/rag.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';
import { CaslModule } from './auth/casl/casl.module';
import { GamificationModule } from './gamification/gamification.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BillingModule } from './billing/billing.module';
import { SearchModule } from './search/search.module';
import { GatewaysModule } from './gateways/gateways.module';

@Module({
  imports: [
    // Load .env file and make ConfigService available
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // CLS (Continuation-Local Storage) for request-scoped context
    // This enables tenant context propagation across async boundaries
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true, // Mount as middleware for all routes
      },
    }),
    ScheduleModule.forRoot(),
    // Configure TypeORM asynchronously using ConfigService with optimizations
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createDatabaseConfig,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    // Core Infrastructure Modules (MUST load before domain modules)
    CoreEntitiesModule, // Global: shared entity repositories
    ProjectCoreModule, // Global: ProjectMembersService for guards
    UsersCoreModule, // Global: UsersService for user lookup
    AuthCoreModule, // Global: JwtAuthGuard, PermissionsGuard via APP_GUARD
    TenantModule, // Global: Tenant isolation infrastructure
    CircuitBreakerModule, // Global: Circuit breaker gateway for external APIs
    // AI Module - provides AI-powered smart setup capabilities
    AiModule,
    CacheModule,
    DatabaseModule,
    PerformanceModule,
    CommonModule,
    EncryptionModule,
    SessionModule,
    OrganizationsModule,
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
    BacklogModule,
    WatchersModule,
    RevisionsModule,
    NotificationsModule,
    ReportsModule,
    AuditLogsModule,
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
    CustomFieldsModule,
    ApiKeysModule,
    WebhooksModule,
    TelemetryModule,
    RagModule,
    AnalyticsModule,
    CaslModule, // RBAC Refactor
    GamificationModule,
    DashboardModule,
    BillingModule,
    SearchModule,
    // NEW: Real-time Gateways
    GatewaysModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global interceptor: Extract tenant context from JWT on every request
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    // Global interceptor: Handle optimistic locking conflicts (409 responses)
    {
      provide: APP_INTERCEPTOR,
      useClass: OptimisticLockingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`🛑 Shutdown signal received: ${signal}`);

    // 1. Stop accepting new HTTP requests (handled by NestJS)
    this.logger.log('Stopping HTTP server...');

    // 2. Wait for in-flight requests to complete
    this.logger.log('Waiting for in-flight requests to complete...');
    const gracePeriod = parseInt(process.env.API_GRACE_PERIOD_MS || '5000', 10);
    await new Promise((resolve) => setTimeout(resolve, gracePeriod));

    this.logger.log('✅ Graceful shutdown complete');
  }
}
