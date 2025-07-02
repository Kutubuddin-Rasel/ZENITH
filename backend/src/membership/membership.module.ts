import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectMembersService } from './project-members/project-members.service';
import { ProjectMembersController } from './project-members/project-members.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectMember]), // register repository for the entity
  ],
  providers: [ProjectMembersService],
  controllers: [ProjectMembersController],
  exports: [ProjectMembersService], // so other modules (e.g. AuthService) can inject it
})
export class MembershipModule {} // or export class ProjectMembersModule {}
