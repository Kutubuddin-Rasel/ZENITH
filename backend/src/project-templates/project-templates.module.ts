import { Module, forwardRef, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTemplate } from './entities/project-template.entity';
import { UserPreferences } from '../user-preferences/entities/user-preferences.entity';
import { ProjectWizardService } from './services/project-wizard.service';
import { TemplateRecommendationService } from './services/template-recommendation.service';
import { ProjectWizardController } from './controllers/project-wizard.controller';
import { ProjectsModule } from '../projects/projects.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { MembershipModule } from '../membership/membership.module';
import { BoardsModule } from '../boards/boards.module';
import { SprintsModule } from '../sprints/sprints.module';
import { Project } from '../projects/entities/project.entity';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CacheModule } from '../cache/cache.module';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectTemplate, UserPreferences, Project]),
    ProjectsModule,
    forwardRef(() => UserPreferencesModule),
    forwardRef(() => BoardsModule),
    forwardRef(() => SprintsModule),
    forwardRef(() => WorkflowsModule),
    MembershipModule,
    CacheModule,
    NestCacheModule.register(),
    AiModule,
  ],
  providers: [ProjectWizardService, TemplateRecommendationService],
  controllers: [ProjectWizardController],
  exports: [ProjectWizardService, TemplateRecommendationService],
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
