import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProjectSecurityPolicyDto } from './dto/project-security-policy.dto';
import { ProjectSecurityPolicyCommandService } from './services/project-security-policy-command.service';

interface AuthRequest {
  user: {
    userId: string;
    isSuperAdmin: boolean;
  };
}

/**
 * ProjectSecurityPolicyController
 *
 * HTTP edge over the security-policy command service. Reads
 * (`GET /security-policy`) are routed through the command service's
 * `getOrCreate` because the UI binds against a non-null shape — the
 * read-side `IProjectSecurityPolicyQuery` token returns `null` when
 * no policy row exists (used by the auth guard fast path), which is
 * not the contract the settings UI expects.
 */
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectSecurityPolicyController {
  constructor(
    private readonly policyCommand: ProjectSecurityPolicyCommandService,
  ) {}

  @Get(':id/security-policy')
  async getPolicy(@Param('id') projectId: string) {
    return this.policyCommand.getOrCreate(projectId);
  }

  @Patch(':id/security-policy')
  @HttpCode(HttpStatus.OK)
  async updatePolicy(
    @Param('id') projectId: string,
    @Body() dto: UpdateProjectSecurityPolicyDto,
    @Request() req: AuthRequest,
  ) {
    // TODO: Add proper role check via ProjectMembersService
    // For now, allow Super Admins (and any authenticated caller — the
    // legacy controller had the same in-progress check structure).
    return this.policyCommand.update(projectId, req.user.userId, dto);
  }

  @Get(':id/security-policy/compliance')
  getCompliance(@Param('id') projectId: string, @Request() req: AuthRequest) {
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return {
      projectId,
      totalMembers: 0,
      compliantMembers: 0,
      violations: [],
      message: 'Compliance check not yet implemented',
    };
  }
}
