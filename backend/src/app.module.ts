import {
  Module,
  OnApplicationShutdown,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { ModuleRef, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { LoggingModule } from './common/logging/logging.module';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
// Core Infrastructure Modules
import { CoreEntitiesModule } from './core/entities/core-entities.module';
import { ProjectCoreModule } from './core/membership/project-core.module';
import { UsersCoreModule } from './core/users/users-core.module';
import { AuthCoreModule } from './core/auth/auth-core.module';
import { TenantModule } from './core/tenant/tenant.module';
import { CircuitBreakerModule } from './core/integrations/circuit-breaker.module';
import { CoreQueueModule } from './core/core-queue.module';
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
import { RBACModule } from './rbac/rbac.module';
import { ScheduledTasksModule } from './scheduled-tasks/scheduled-tasks.module';
import { HealthModule } from './health/health.module';
import { CsrfModule } from './security/csrf/csrf.module';

import {
  appConfig,
  authConfig,
  rateLimitConfig,
  cacheConfig,
  integrationConfig,
} from './config';

@Module({
  imports: [
    // =========================================================================
    // LAYER 1: CORE INFRASTRUCTURE
    // These modules must load first - they provide fundamental services
    // (config, database, logging, scheduling) that other modules depend on.
    // =========================================================================
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        authConfig,
        rateLimitConfig,
        cacheConfig,
        integrationConfig,
      ],
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),
    LoggingModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createDatabaseConfig,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        interface RateLimitCfg {
          global: { ttlMs?: number; limit?: number };
        }
        const rateLimitCfg = configService.get<RateLimitCfg>('rateLimit');
        return [
          {
            ttl: rateLimitCfg?.global.ttlMs || 60000,
            limit: rateLimitCfg?.global.limit || 100,
          },
        ];
      },
    }),
    DatabaseModule,
    CacheModule,
    PerformanceModule,
    HealthModule,

    // =========================================================================
    // LAYER 2: CORE DOMAIN MODULES (Global Providers)
    // These modules provide shared services used across the application.
    // They are marked @Global or provide APP_GUARD/APP_INTERCEPTOR bindings.
    // =========================================================================
    CoreEntitiesModule,
    ProjectCoreModule,
    UsersCoreModule,
    AuthCoreModule,
    TenantModule,
    CircuitBreakerModule,
    CoreQueueModule,

    // =========================================================================
    // LAYER 3: SHARED/SECURITY MODULES
    // Cross-cutting concerns used by multiple feature modules.
    // =========================================================================
    CommonModule,
    EncryptionModule, // DEDUPLICATED: Was imported twice (lines 148, 169)
    SessionModule, // DEDUPLICATED: Was imported twice (lines 149, 170)
    AccessControlModule,
    CsrfModule,
    CaslModule,
    RBACModule,
    AuditLogsModule,
    TelemetryModule,

    // =========================================================================
    // LAYER 4: FEATURE/DOMAIN MODULES
    // Business logic modules organized by domain area.
    // =========================================================================

    // --- Identity & Access ---
    OrganizationsModule,
    UsersModule,
    AuthModule,
    InvitesModule,
    MembershipModule,
    ApiKeysModule,

    // --- Project Management ---
    ProjectsModule,
    ProjectTemplatesModule,
    IssuesModule,
    SprintsModule,
    BacklogModule,
    BoardsModule,
    ReleasesModule,
    WorkflowsModule,
    CustomFieldsModule,

    // --- Collaboration ---
    CommentsModule,
    AttachmentsModule,
    WatchersModule,
    RevisionsModule,
    NotificationsModule,

    // --- Taxonomy & Organization ---
    TaxonomyModule,

    // --- Analytics & Reporting ---
    ReportsModule,
    AnalyticsModule,
    DashboardModule,

    // --- Resource & Capacity ---
    ResourceManagementModule,
    ScheduledTasksModule,

    // --- User Experience ---
    UserPreferencesModule,
    OnboardingModule,
    SatisfactionModule,
    GamificationModule,
    SearchModule,

    // --- Integrations & External ---
    IntegrationsModule,
    WebhooksModule,
    BillingModule,

    // --- AI & Intelligence ---
    AiModule,
    RagModule,

    // --- Real-time ---
    GatewaysModule,
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
export class AppModule implements OnApplicationShutdown, NestModule {
  constructor(private readonly moduleRef: ModuleRef) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }

  async onApplicationShutdown(_signal?: string) {
    // 1. Stop accepting new HTTP requests (handled by NestJS)
    // 2. Wait for in-flight requests to complete
    const gracePeriod = parseInt(process.env.API_GRACE_PERIOD_MS || '5000', 10);
    await new Promise((resolve) => setTimeout(resolve, gracePeriod));
  }
}
