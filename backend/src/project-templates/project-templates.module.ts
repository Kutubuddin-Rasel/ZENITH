import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTemplate } from './entities/project-template.entity';
import { UserPreferences } from '../user-preferences/entities/user-preferences.entity';
import { ProjectWizardService } from './services/project-wizard.service';
import { TemplateRecommendationService } from './services/template-recommendation.service';
import { TemplateApplicationService } from './services/template-application.service';
import { ProjectWizardController } from './controllers/project-wizard.controller';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { BoardsModule } from '../boards/boards.module';
import { SprintsModule } from '../sprints/sprints.module';
import { Project } from '../projects/entities/project.entity';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CacheModule } from '../cache/cache.module';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { AiModule } from '../ai/ai.module';
import { ProjectsModule } from '../projects/projects.module';
// NEW: Clean Architecture imports
import { WizardDtoMapper } from './mappers/wizard-dto.mapper';
import { AIResponseValidator } from './validators/ai-response.validator';
import { ProjectCreationOrchestrator } from './orchestrators/project-creation.orchestrator';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectTemplate, UserPreferences, Project]),
    // CYCLE FIX: Use forwardRef for all potentially circular imports
    forwardRef(() => UserPreferencesModule),
    forwardRef(() => BoardsModule),
    forwardRef(() => SprintsModule),
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
  ],
  controllers: [ProjectWizardController],
  exports: [
    ProjectWizardService,
    TemplateRecommendationService,
    TemplateApplicationService,
    // NEW: Export for other modules
    WizardDtoMapper,
    ProjectCreationOrchestrator,
  ],
})
export class ProjectTemplatesModule implements OnModuleInit {
  private readonly logger = new Logger(ProjectTemplatesModule.name);

  constructor(
    private readonly templateRecommendationService: TemplateRecommendationService,
  ) { }

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
