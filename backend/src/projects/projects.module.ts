import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
// CYCLE FIX: Removed ProjectTemplatesModule - TemplateApplicationService accessed via forwardRef in ProjectsService

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectAccessSettings, ProjectSecurityPolicy, Issue]),
    // CYCLE FIX: Mutual cycle with InvitesModule - both use forwardRef
    forwardRef(() => InvitesModule),
    WorkflowsModule,
  ],
  providers: [ProjectsService, ProjectSecurityPolicyService],
  controllers: [ProjectsController, ProjectSecurityPolicyController],
  exports: [ProjectsService, ProjectSecurityPolicyService],
})
export class ProjectsModule { }
