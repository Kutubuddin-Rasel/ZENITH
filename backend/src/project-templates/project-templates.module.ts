import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTemplate } from './entities/project-template.entity';
import { UserPreferences } from '../user-preferences/entities/user-preferences.entity';
import { ProjectWizardService } from './services/project-wizard.service';
import { TemplateRecommendationService } from './services/template-recommendation.service';
import { ProjectWizardController } from './controllers/project-wizard.controller';
import { ProjectsModule } from '../projects/projects.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectTemplate, UserPreferences]),
    ProjectsModule,
    forwardRef(() => UserPreferencesModule),
    MembershipModule,
  ],
  providers: [ProjectWizardService, TemplateRecommendationService],
  controllers: [ProjectWizardController],
  exports: [ProjectWizardService, TemplateRecommendationService],
})
export class ProjectTemplatesModule {}
