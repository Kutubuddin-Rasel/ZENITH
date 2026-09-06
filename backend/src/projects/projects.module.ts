import { forwardRef, Module, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectTemplatesModule } from '../project-templates/project-templates.module';

import { Project } from './entities/project.entity';
import { ProjectAccessSettings } from './entities/project-access-settings.entity';
import { ProjectSecurityPolicy } from './entities/project-security-policy.entity';

import { ProjectsController } from './projects.controller';
import { ProjectSecurityPolicyController } from './project-security-policy.controller';
import { ProjectGenerationController } from './controllers/project-generation.controller';

import { WorkflowsModule } from '../workflows/workflows.module';
import { CacheModule } from '../cache/cache.module';

import { ProjectGenerationProcessor } from './processors/project-generation.processor';
import { ProjectGenerationService } from './services/project-generation.service';

import { ProjectQueryService } from './services/project-query.service';
import { ProjectCommandService } from './services/project-command.service';
import { ProjectMetricsService } from './services/project-metrics.service';
import { ProjectAccessQueryService } from './services/project-access-query.service';
import { ProjectAccessCommandService } from './services/project-access-command.service';
import { ProjectSecurityPolicyQueryService } from './services/project-security-policy-query.service';
import { ProjectSecurityPolicyCommandService } from './services/project-security-policy-command.service';

import { AuditLogWriterAdapter } from './adapters/audit-log-writer.adapter';
import { ProjectLookupAdapter } from './adapters/project-lookup.adapter';
import { ProjectLookupPort } from '../invites/ports/project-lookup.port';

import {
  AUDIT_LOG_WRITER_TOKEN,
  PROJECT_ACCESS_COMMAND_TOKEN,
  PROJECT_ACCESS_QUERY_TOKEN,
  PROJECT_COMMAND_TOKEN,
  PROJECT_METRICS_TOKEN,
  PROJECT_QUERY_TOKEN,
  PROJECT_SECURITY_POLICY_TOKEN,
} from './constants/projects.tokens';

/**
 * BullMQ queue name for async project generation from text.
 * Exported as constant for type-safe @InjectQueue() and @Processor()
 * decorators.
 */
export const PROJECT_GENERATION_QUEUE = 'project-generation';

/**
 * ProjectsModule
 *
 * Owns the `projects` aggregate (Level 3 root). Step 3 of the
 * projects SOLID refactor decomposes the 598-line `ProjectsService`
 * god-class into seven focused services, each bound behind exactly
 * one ISP token:
 *
 *  - `PROJECT_QUERY_TOKEN`             → `ProjectQueryService`
 *  - `PROJECT_COMMAND_TOKEN`           → `ProjectCommandService`
 *  - `PROJECT_METRICS_TOKEN`           → `ProjectMetricsService`
 *  - `PROJECT_ACCESS_QUERY_TOKEN`      → `ProjectAccessQueryService`
 *  - `PROJECT_ACCESS_COMMAND_TOKEN`    → `ProjectAccessCommandService`
 *  - `PROJECT_SECURITY_POLICY_TOKEN`   → `ProjectSecurityPolicyQueryService`
 *  - `AUDIT_LOG_WRITER_TOKEN`          → `AuditLogWriterAdapter`
 *
 * Cycle eliminations
 * ------------------
 * The legacy `forwardRef(() => TemplateApplicationService)` is gone —
 * `ProjectCommandService` now consumes the outbound
 * `TemplateApplicationPort` (bound inside `ProjectTemplatesModule`).
 * The matching `forwardRef(() => ProjectsModule)` on the
 * project-templates side is also removed; both modules now use plain
 * `imports: [...]` edges (one-way arrows, no cycles).
 *
 * The earlier `invites ↔ projects` cycle elimination via
 * `ProjectLookupPort` stays in place; the adapter is rewired to
 * inject `IProjectQuery` (the new ISP token) instead of the deleted
 * god-class.
 *
 * What this module exports
 * ------------------------
 * Only abstract tokens. Concrete service classes are NOT exported,
 * matching the sealed-module pattern proven in `invites` and `csrf`.
 * External consumers depend on `IProjectQuery`, `IProjectCommand`,
 * etc., via the symbol tokens.
 *
 * `TypeOrmModule.forFeature([Project])` is retained because
 * `TenantRepositoryFactory.create(...)` requires the concrete
 * `Repository<Project>`. The `ProjectAccessSettings` and
 * `ProjectSecurityPolicy` entities are owned by the @Global
 * `DatabaseModule` (registered in `forRoot()`) — no local
 * `forFeature` needed.
 */

const QUERY_PROVIDERS: Provider[] = [
  ProjectQueryService,
  { provide: PROJECT_QUERY_TOKEN, useExisting: ProjectQueryService },
  ProjectMetricsService,
  { provide: PROJECT_METRICS_TOKEN, useExisting: ProjectMetricsService },
  ProjectAccessQueryService,
  {
    provide: PROJECT_ACCESS_QUERY_TOKEN,
    useExisting: ProjectAccessQueryService,
  },
  ProjectSecurityPolicyQueryService,
  {
    provide: PROJECT_SECURITY_POLICY_TOKEN,
    useExisting: ProjectSecurityPolicyQueryService,
  },
];

const COMMAND_PROVIDERS: Provider[] = [
  ProjectCommandService,
  { provide: PROJECT_COMMAND_TOKEN, useExisting: ProjectCommandService },
  ProjectAccessCommandService,
  {
    provide: PROJECT_ACCESS_COMMAND_TOKEN,
    useExisting: ProjectAccessCommandService,
  },
  ProjectSecurityPolicyCommandService,
];

const ADAPTER_PROVIDERS: Provider[] = [
  AuditLogWriterAdapter,
  { provide: AUDIT_LOG_WRITER_TOKEN, useExisting: AuditLogWriterAdapter },
  { provide: ProjectLookupPort, useClass: ProjectLookupAdapter },
];

@Module({
  imports: [
    // Concrete `Repository<Project>` is still needed by
    // `TenantRepositoryFactory.create(...)` inside `ProjectQueryService`.
    TypeOrmModule.forFeature([
      Project,
      ProjectAccessSettings,
      ProjectSecurityPolicy,
    ]),
    WorkflowsModule,
    BullModule.registerQueue({ name: PROJECT_GENERATION_QUEUE }),
    CacheModule,
    // Resolves `TemplateApplicationPort` for `ProjectCommandService.create()`.
    // `forwardRef` is required only at the MODULE level — service-level
    // injection is via the abstract port (DIP), with no concrete-class
    // coupling. The structural module reference is the contained price for
    // keeping `templateId` opt-in on the same create transaction.
    forwardRef(() => ProjectTemplatesModule),
  ],
  providers: [
    ...QUERY_PROVIDERS,
    ...COMMAND_PROVIDERS,
    ...ADAPTER_PROVIDERS,
    ProjectGenerationProcessor,
    ProjectGenerationService,
  ],
  controllers: [
    ProjectsController,
    ProjectSecurityPolicyController,
    ProjectGenerationController,
  ],
  exports: [
    // ISP tokens only — concrete service classes intentionally NOT exported.
    PROJECT_QUERY_TOKEN,
    PROJECT_COMMAND_TOKEN,
    PROJECT_METRICS_TOKEN,
    PROJECT_ACCESS_QUERY_TOKEN,
    PROJECT_ACCESS_COMMAND_TOKEN,
    PROJECT_SECURITY_POLICY_TOKEN,
    AUDIT_LOG_WRITER_TOKEN,
    // Outbound port re-exported so `InvitesModule` resolves it through
    // a normal `imports: [ProjectsModule]` edge (cycle-break with
    // invites — see `ProjectLookupPort` JSDoc).
    ProjectLookupPort,
  ],
})
export class ProjectsModule {}
