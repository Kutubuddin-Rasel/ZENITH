import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { MembershipModule } from '../membership/membership.module';
import { Issue } from '../issues/entities/issue.entity';
import { InvitesModule } from '../invites/invites.module';
import { UsersModule } from '../users/users.module';
// NEW: Import ProjectTemplatesModule for TemplateApplicationService
import { ProjectTemplatesModule } from '../project-templates/project-templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Issue]),
    MembershipModule,
    UsersModule,
    forwardRef(() => InvitesModule),
    // NEW: Import for template application in direct create
    forwardRef(() => ProjectTemplatesModule),
  ],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
