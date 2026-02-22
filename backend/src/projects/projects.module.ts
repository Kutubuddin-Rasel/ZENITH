import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Project } from './entities/project.entity';
import { ProjectAccessSettings } from './entities/project-access-settings.entity';
import { ProjectSecurityPolicy } from './entities/project-security-policy.entity';
import { ProjectsService } from './projects.service';
import { ProjectSecurityPolicyService } from './project-security-policy.service';
import { ProjectsController } from './projects.controller';
import { ProjectSecurityPolicyController } from './project-security-policy.controller';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { Issue } from '../issues/entities/issue.entity';
import { InvitesModule } from '../invites/invites.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ProjectGenerationProcessor } from './processors/project-generation.processor';
import { ProjectGenerationService } from './services/project-generation.service';
import { ProjectGenerationController } from './controllers/project-generation.controller';
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
// CYCLE FIX: Removed ProjectTemplatesModule - TemplateApplicationService accessed via forwardRef in ProjectsService

/**
 * BullMQ queue name for async project generation from text.
 * Exported as constant for type-safe @InjectQueue() and @Processor() decorators.
 */
export const PROJECT_GENERATION_QUEUE = 'project-generation';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectAccessSettings,
      ProjectSecurityPolicy,
      Issue,
    ]),
    // CYCLE FIX: Mutual cycle with InvitesModule - both use forwardRef
    forwardRef(() => InvitesModule),
    WorkflowsModule,
    // BullMQ: Async project generation from unstructured text (Magic Wand)
    // Consumer (Processor) will be registered when we build the generation service
    BullModule.registerQueue({ name: PROJECT_GENERATION_QUEUE }),
  ],
  providers: [
    ProjectsService,
    ProjectSecurityPolicyService,
    ProjectGenerationProcessor,
    ProjectGenerationService,
  ],
  controllers: [
    ProjectsController,
    ProjectSecurityPolicyController,
    ProjectGenerationController,
  ],
  exports: [ProjectsService, ProjectSecurityPolicyService],
})
export class ProjectsModule {}
