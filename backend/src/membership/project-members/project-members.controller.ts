/**
 * ProjectMembersController — HTTP Interface for Project Membership Management
 *
 * SECURITY GUARD CHAIN (executes left-to-right):
 *   1. JwtAuthGuard       — Authentication (populates req.user)
 *   2. StatefulCsrfGuard  — CSRF integrity check (reads @RequireCsrf metadata)
 *   3. PermissionsGuard   — RBAC authorization (members:view, members:add, members:remove)
 *
 * CSRF ACTIVATION:
 *   StatefulCsrfGuard is metadata-driven. It checks if the handler has
 *   @RequireCsrf() metadata and skips validation if absent. This means
 *   GET endpoints pass through CSRF untouched, while POST/DELETE/PATCH
 *   require the x-csrf-token header.
 *
 * ROLE HIERARCHY ENFORCEMENT:
 *   On mutations that assign roles (POST, PATCH), the controller resolves
 *   the actor's project role via getUserRole() and passes it to the service.
 *   The service enforces canManageRole() — prevents privilege escalation.
 *
 * ROUTES:
 *   GET    /projects/:projectId/members            — List project members
 *   POST   /projects/:projectId/members            — Add member (CSRF + hierarchy)
 *   DELETE /projects/:projectId/members/:userId     — Remove member (CSRF)
 *   PATCH  /projects/:projectId/members/:userId     — Update role (CSRF + hierarchy)
 *
 * @see ProjectMembersService for business logic
 * @see StatefulCsrfGuard for CSRF validation implementation
 * @see role-hierarchy.ts for privilege escalation prevention
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
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectMembersService } from './project-members.service';
import { ProjectRole } from '../enums/project-role.enum';
import { ProjectMember } from '../entities/project-member.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { StatefulCsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import { AddMemberDto } from '../dto/add-member.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { JwtRequestUser } from '../../auth/types/jwt-request-user.interface';

// =============================================================================
// TYPES
// =============================================================================

/** Typed Express request after JWT authentication */
interface AuthenticatedRequest {
  readonly user: JwtRequestUser;
}

// =============================================================================
// CONTROLLER
// =============================================================================

@Controller('projects/:projectId/members')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(private readonly pmService: ProjectMembersService) {}

  /**
   * GET /projects/:projectId/members
   * List all members of a project with user details.
   *
   * No CSRF required — read-only endpoint.
   */
  @RequirePermission('members:view')
  @Get()
  async list(@Param('projectId') projectId: string): Promise<ProjectMember[]> {
    return this.pmService.listMembers(projectId);
  }

  /**
   * POST /projects/:projectId/members
   * Add an existing user to the project with a specified role.
   *
   * SECURITY:
   * - CSRF: frontend must include x-csrf-token header
   * - Role Hierarchy: actor's project role must be >= the assigned role
   */
  @RequirePermission('members:add')
  @RequireCsrf()
  @Post()
  async addExisting(
    @Param('projectId') projectId: string,
    @Body() dto: AddMemberDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMember> {
    const actorRole = await this.resolveActorRole(projectId, req.user.userId);

    return this.pmService.addMemberToProject(
      {
        projectId,
        userId: dto.userId,
        roleName: dto.roleName as ProjectRole,
      },
      actorRole,
    );
  }

  /**
   * DELETE /projects/:projectId/members/:userId
   * Remove a member from the project.
   *
   * SECURITY:
   * - CSRF: frontend must include x-csrf-token header
   * - Permission: requires members:remove
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
   * SECURITY:
   * - CSRF: frontend must include x-csrf-token header
   * - Role Hierarchy: actor's project role must be >= the new target role
   */
  @RequirePermission('members:add')
  @RequireCsrf()
  @Patch(':userId')
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMember> {
    const actorRole = await this.resolveActorRole(projectId, req.user.userId);

    return this.pmService.updateMemberRole(
      projectId,
      userId,
      dto.roleName as ProjectRole,
      actorRole,
    );
  }

  // ===========================================================================
  // PRIVATE: Actor Role Resolution
  // ===========================================================================

  /**
   * Resolve the acting user's role in the target project.
   *
   * This enables role hierarchy enforcement — the service can verify
   * that the actor has sufficient authority to assign the target role.
   *
   * @throws ForbiddenException if the actor is not a member of the project
   */
  private async resolveActorRole(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectRole> {
    const role = await this.pmService.getUserRole(projectId, actorUserId);
    if (!role) {
      throw new ForbiddenException(
        'You must be a member of this project to manage memberships',
      );
    }
    return role;
  }
}
