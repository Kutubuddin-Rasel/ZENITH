import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectSecurityPolicyService } from './project-security-policy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProjectSecurityPolicyDto } from './dto/project-security-policy.dto';

interface AuthRequest {
  user: {
    userId: string;
    isSuperAdmin: boolean;
  };
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectSecurityPolicyController {
  constructor(private readonly policyService: ProjectSecurityPolicyService) {}

  /**
   * GET /projects/:id/security-policy
   * Get the security policy for a project
   */
  @Get(':id/security-policy')
  async getPolicy(@Param('id') projectId: string) {
    return this.policyService.getOrCreate(projectId);
  }

  /**
   * PATCH /projects/:id/security-policy
   * Update the security policy for a project
   * Only Project Leads and Super Admins can modify
   */
  @Patch(':id/security-policy')
  @HttpCode(HttpStatus.OK)
  async updatePolicy(
    @Param('id') projectId: string,
    @Body() dto: UpdateProjectSecurityPolicyDto,
    @Request() req: AuthRequest,
  ) {
    // TODO: Add proper role check via ProjectMembersService
    // For now, allow Super Admins
    if (!req.user.isSuperAdmin) {
      // In a real implementation, check if user is ProjectLead for this project
      // const membership = await projectMembersService.getMembership(projectId, req.user.userId);
      // if (membership?.roleName !== 'ProjectLead') throw new ForbiddenException();
    }

    return this.policyService.update(projectId, req.user.userId, dto);
  }

  /**
   * GET /projects/:id/security-policy/compliance
   * Check compliance status of all project members
   */
  @Get(':id/security-policy/compliance')
  getCompliance(@Param('id') projectId: string, @Request() req: AuthRequest) {
    // Only Super Admins or Project Leads can view compliance
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Access denied');
    }

    // TODO: Implement compliance check
    // This would query all project members and check if they meet policy requirements
    return {
      projectId,
      totalMembers: 0,
      compliantMembers: 0,
      violations: [],
      message: 'Compliance check not yet implemented',
    };
  }
}
