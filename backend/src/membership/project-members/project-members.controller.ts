// src/membership/project-members.controller.ts
import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Patch,
} from '@nestjs/common';
import { ProjectMembersService } from './project-members.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermission } from 'src/auth/decorators/require-permission.decorator';
import { IsString, IsIn } from 'class-validator';

const ALLOWED_ROLES = ['Developer', 'QA', 'Designer', 'ProjectLead', 'Viewer'];

class AddMemberDto {
  @IsString()
  userId: string; // ID of existing user to add

  @IsString()
  @IsIn(ALLOWED_ROLES, { message: `roleName must be one of: ${ALLOWED_ROLES.join(', ')}` })
  roleName: string; // e.g. 'Developer'
}

class UpdateMemberRoleDto {
  @IsString()
  @IsIn(ALLOWED_ROLES, { message: `roleName must be one of: ${ALLOWED_ROLES.join(', ')}` })
  roleName: string; // New role for the member
}

@Controller('projects/:projectId/members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectMembersController {
  constructor(private readonly pmService: ProjectMembersService) {}

  // List members: GET /projects/:projectId/members
  @RequirePermission('members:view')
  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.pmService.listMembers(projectId);
  }

  // Add existing user: POST /projects/:projectId/members
  @RequirePermission('members:add')
  @Post()
  async addExisting(
    @Param('projectId') projectId: string,
    @Body() dto: AddMemberDto,
  ) {
    if (!dto.userId) {
      throw new BadRequestException('userId is required');
    }
    return this.pmService.addMemberToProject({
      projectId,
      userId: dto.userId,
      roleName: dto.roleName,
    });
  }

  // Remove member: DELETE /projects/:projectId/members/:userId
  @RequirePermission('members:remove')
  @Delete(':userId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    await this.pmService.removeMemberFromProject(projectId, userId);
    return { message: 'Member removed' };
  }

  // Update member role: PATCH /projects/:projectId/members/:userId
  @RequirePermission('members:add')
  @Patch(':userId')
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    if (!dto.roleName) {
      throw new BadRequestException('roleName is required');
    }
    return this.pmService.updateMemberRole(projectId, userId, dto.roleName);
  }
}
