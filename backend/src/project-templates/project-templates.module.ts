import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTemplate } from './entities/project-template.entity';
import { UserPreferences } from '../user-preferences/entities/user-preferences.entity';
import { ProjectWizardService } from './services/project-wizard.service';
import { TemplateRecommendationService } from './services/template-recommendation.service';
import { TemplateApplicationService } from './services/template-application.service';
import { ProjectWizardController } from './controllers/project-wizard.controller';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { BoardsModule } from '../boards/boards.module';
import { SprintsModule } from '../sprints/sprints.module';
import { Project } from '../projects/entities/project.entity';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CacheModule } from '../cache/cache.module';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { AiModule } from '../ai/ai.module';
import { ProjectsModule } from '../projects/projects.module';
import { TemplateApplicationPort } from '../projects';
// NEW: Clean Architecture imports
import { WizardDtoMapper } from './mappers/wizard-dto.mapper';
import { AIResponseValidator } from './validators/ai-response.validator';
import { ProjectCreationOrchestrator } from './orchestrators/project-creation.orchestrator';
import { TemplateApplicationAdapter } from './adapters/template-application.adapter';

/**
 * ProjectTemplatesModule
 *
 * Step 3 of the projects refactor eliminates the historic
 * `forwardRef(() => ProjectsModule)` cycle: this module now imports
 * `ProjectsModule` directly (one-way edge) and BINDS the outbound
 * `TemplateApplicationPort` declared by `projects/ports/`. The
 * projects command service resolves the port through a normal
 * `imports: [ProjectTemplatesModule]` edge from any consumer that
 * needs both surfaces.
 *
 * Boards SOLID Refactor (Step 3 commit 8) drops the
 * `forwardRef(() => BoardsModule)` shim. Boards stopped depending
 * on project-templates earlier (forward edge removed in a prior
 * pass), and the inbound coupling from `template-application` /
 * `project-wizard` now flows through the abstract `BoardSeedPort`
 * exported by `BoardsModule` — no concrete `BoardsService` reach
 * across the seam. The edge is plain, non-`forwardRef`.
 *
 * Remaining `forwardRef` calls (`SprintsModule`,
 * `UserPreferencesModule`) belong to separate decomposition tracks.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectTemplate, UserPreferences, Project]),
    BoardsModule,
    // CYCLE FIX: Use forwardRef for the remaining potentially circular imports
    forwardRef(() => UserPreferencesModule),
    forwardRef(() => SprintsModule),
    // Step 3 cycle-break (service level): the service-level cycle
    // (ProjectsService ↔ TemplateApplicationService) is eliminated via
    // the abstract `TemplateApplicationPort`. A structural module-level
    // cycle remains because `ProjectsModule` consumes the port binding
    // that lives here — kept contained behind `forwardRef`, with all
    // actual service coupling routed through ISP tokens (DIP).
    forwardRef(() => ProjectsModule),
    WorkflowsModule,
    CacheModule,
    NestCacheModule.register(),
    AiModule,
  ],
  providers: [
    // Existing services
    ProjectWizardService,
    TemplateRecommendationService,
    TemplateApplicationService,
    // NEW: Clean Architecture providers
    WizardDtoMapper,
    AIResponseValidator,
    ProjectCreationOrchestrator,
    // Outbound port satisfied for ProjectsModule (Step 3 cycle-break).
    TemplateApplicationAdapter,
    {
      provide: TemplateApplicationPort,
      useExisting: TemplateApplicationAdapter,
    },
  ],
  controllers: [ProjectWizardController],
  exports: [
    ProjectWizardService,
    TemplateRecommendationService,
    TemplateApplicationService,
    // NEW: Export for other modules
    WizardDtoMapper,
    ProjectCreationOrchestrator,
    // Re-exported so any module importing ProjectTemplatesModule
    // resolves the port without seeing the concrete adapter class.
    TemplateApplicationPort,
  ],
})
export class ProjectTemplatesModule implements OnModuleInit {
  private readonly logger = new Logger(ProjectTemplatesModule.name);

  constructor(
    private readonly templateRecommendationService: TemplateRecommendationService,
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('Seeding default project templates...');
      await this.templateRecommendationService.createDefaultTemplates();
      this.logger.log('Default project templates seeded successfully.');
    } catch (error) {
      this.logger.error('Failed to seed default templates:', error);
    }
  }
}
