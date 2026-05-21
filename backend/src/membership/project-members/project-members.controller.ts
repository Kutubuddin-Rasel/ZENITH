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
 *   the actor's project role via `IProjectMemberQuery.getUserRole()` and
 *   passes it to the command service. The command service delegates the
 *   actual hierarchy check to `IProjectMemberPolicy` — prevents privilege
 *   escalation.
 *
 * ROUTES:
 *   GET    /projects/:projectId/members            — List project members
 *   POST   /projects/:projectId/members            — Add member (CSRF + hierarchy)
 *   DELETE /projects/:projectId/members/:userId    — Remove member (CSRF)
 *   PATCH  /projects/:projectId/members/:userId    — Update role (CSRF + hierarchy)
 *
 * ARCHITECTURE — Step 3 ISP wiring
 * --------------------------------
 *   - Reads  → `PROJECT_MEMBER_QUERY_TOKEN`   (IProjectMemberQuery)
 *   - Writes → `PROJECT_MEMBER_COMMAND_TOKEN` (IProjectMemberCommand)
 *
 *   The concrete `ProjectMembersService` god-class was deleted; this
 *   controller never imports a concrete persistence class.
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProjectRole } from '../enums/project-role.enum';
import {
  PROJECT_MEMBER_COMMAND_TOKEN,
  PROJECT_MEMBER_QUERY_TOKEN,
} from '../constants/membership.tokens';
import type {
  IProjectMemberCommand,
  IProjectMemberQuery,
  ProjectMemberSummary,
  ProjectMemberWithUser,
} from '../interfaces/membership.interfaces';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { StatefulCsrfGuard, RequireCsrf } from '../../security/csrf/csrf.guard';
import { AddMemberDto } from '../dto/add-member.dto';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto';
import { JwtRequestUser } from '../../auth/types/jwt-request-user.interface';

interface AuthenticatedRequest {
  readonly user: JwtRequestUser;
}

@Controller('projects/:projectId/members')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly memberQuery: IProjectMemberQuery,
    @Inject(PROJECT_MEMBER_COMMAND_TOKEN)
    private readonly memberCommand: IProjectMemberCommand,
  ) {}

  @RequirePermission('members:view')
  @Get()
  async list(
    @Param('projectId') projectId: string,
  ): Promise<readonly ProjectMemberWithUser[]> {
    return this.memberQuery.listMembers(projectId);
  }

  @RequirePermission('members:add')
  @RequireCsrf()
  @Post()
  async addExisting(
    @Param('projectId') projectId: string,
    @Body() dto: AddMemberDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMemberSummary> {
    const actorRole = await this.resolveActorRole(projectId, req.user.userId);

    return this.memberCommand.addMember({
      projectId,
      userId: dto.userId,
      roleName: dto.roleName as ProjectRole,
      actorRole,
    });
  }

  @RequirePermission('members:remove')
  @RequireCsrf()
  @Delete(':userId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ): Promise<{ message: string }> {
    await this.memberCommand.removeMember(projectId, userId);
    return { message: 'Member removed' };
  }

  @RequirePermission('members:add')
  @RequireCsrf()
  @Patch(':userId')
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMemberSummary> {
    const actorRole = await this.resolveActorRole(projectId, req.user.userId);

    return this.memberCommand.updateMemberRole({
      projectId,
      userId,
      newRole: dto.roleName as ProjectRole,
      actorRole,
    });
  }

  /**
   * Resolve the acting user's role in the target project so the command
   * service can run role-hierarchy enforcement via `IProjectMemberPolicy`.
   *
   * @throws ForbiddenException when the actor is not a member.
   */
  private async resolveActorRole(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectRole> {
    const role = await this.memberQuery.getUserRole(projectId, actorUserId);
    if (!role) {
      throw new ForbiddenException(
        'You must be a member of this project to manage memberships',
      );
    }
    return role;
  }
}
