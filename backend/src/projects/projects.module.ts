import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { MembershipModule } from '../membership/membership.module'; // adjust if file named differently
import { Issue } from '../issues/entities/issue.entity';
import { AuthModule } from '../auth/auth.module';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    // If you want to query Issues for summary inside ProjectsService:
    TypeOrmModule.forFeature([Issue]),
    MembershipModule,
    forwardRef(() => InvitesModule),
    forwardRef(() => AuthModule),
    // Note: ProjectMembersModule should import TypeOrmModule.forFeature([ProjectMember])
  ],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
