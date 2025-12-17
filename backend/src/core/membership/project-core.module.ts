import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMember } from '../../membership/entities/project-member.entity';
import { ProjectMembersService } from '../../membership/project-members/project-members.service';

/**
 * ProjectCoreModule
 *
 * Provides ProjectMembersService globally for permission checking.
 * This service is required by:
 * - PermissionsGuard (checks project membership and roles)
 * - Multiple domain modules for authorization
 *
 * By making it global, we break the circular dependency where:
 * AuthModule -> MembershipModule -> [some module] -> AuthModule
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ProjectMember])],
  providers: [ProjectMembersService],
  exports: [ProjectMembersService],
})
export class ProjectCoreModule {}
