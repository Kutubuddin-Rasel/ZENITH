import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { Issue } from '../issues/entities/issue.entity';
import { InvitesModule } from '../invites/invites.module';
import { WorkflowsModule } from '../workflows/workflows.module';
// REMOVED: UsersModule - using UsersCoreModule (global) for UsersService
// CYCLE FIX: Removed ProjectTemplatesModule - TemplateApplicationService accessed via forwardRef in ProjectsService

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Issue]),
    // CYCLE FIX: Mutual cycle with InvitesModule - both use forwardRef
    forwardRef(() => InvitesModule),
    WorkflowsModule,
  ],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule { }
