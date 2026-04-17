/**
 * ProjectMembersController — HTTP Interface for Project Membership Management
 *
 * SECURITY:
 * - JwtAuthGuard: All endpoints require valid JWT
 * - PermissionsGuard: Permission-based access control (members:view, members:add, members:remove)
 * - @RequireCsrf(): CSRF protection on all state-changing mutations (POST, DELETE, PATCH)
 *
 * ROUTES:
 *   GET    /projects/:projectId/members            — List project members
 *   POST   /projects/:projectId/members            — Add member (CSRF protected)
 *   DELETE /projects/:projectId/members/:userId     — Remove member (CSRF protected)
 *   PATCH  /projects/:projectId/members/:userId     — Update role (CSRF protected)
 *
 * @see ProjectMembersService for business logic
 */

import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { ProjectMembersService } from './project-members.service';
import { ProjectRole } from '../enums/project-role.enum';
import { ProjectMember } from '../entities/project-member.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../../security/csrf/csrf.guard';
import { AddMemberDto } from '../dto/add-member.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';

@Controller('projects/:projectId/members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(private readonly pmService: ProjectMembersService) {}

  /**
   * GET /projects/:projectId/members
   * List all members of a project with user details.
   */
  @RequirePermission('members:view')
  @Get()
  async list(
    @Param('projectId') projectId: string,
  ): Promise<ProjectMember[]> {
    return this.pmService.listMembers(projectId);
  }

  /**
   * POST /projects/:projectId/members
   * Add an existing user to the project with a specified role.
   *
   * CSRF protected — frontend must include x-csrf-token header.
   */
  @RequirePermission('members:add')
  @RequireCsrf()
  @Post()
  async addExisting(
    @Param('projectId') projectId: string,
    @Body() dto: AddMemberDto,
  ): Promise<ProjectMember> {
    return this.pmService.addMemberToProject({
      projectId,
      userId: dto.userId,
      roleName: dto.roleName as ProjectRole,
    });
  }

  /**
   * DELETE /projects/:projectId/members/:userId
   * Remove a member from the project.
   *
   * CSRF protected — frontend must include x-csrf-token header.
   */
  @RequirePermission('members:remove')
  @RequireCsrf()
  @Delete(':userId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ): Promise<{ message: string }> {
    await this.pmService.removeMemberFromProject(projectId, userId);
    return { message: 'Member removed' };
  }

  /**
   * PATCH /projects/:projectId/members/:userId
   * Update a member's role in the project.
   *
   * CSRF protected — frontend must include x-csrf-token header.
   */
  @RequirePermission('members:add')
  @RequireCsrf()
  @Patch(':userId')
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<ProjectMember> {
    return this.pmService.updateMemberRole(
      projectId,
      userId,
      dto.roleName as ProjectRole,
    );
  }
}
