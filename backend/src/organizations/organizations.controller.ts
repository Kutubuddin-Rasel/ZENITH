import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /**
   * Create an invitation (Super Admin only)
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('organizations/:id/invites')
  async inviteUser(
    @Param('id') organizationId: string,
    @Body() dto: CreateInviteDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    // Only Super Admin can invite
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admins can invite users');
    }

    // Ensure Super Admin belongs to this organization (optional, but safer)
    // In our model, Super Admin is scoped to an organization.
    // If we want to strictly enforce they can only invite to *their* org:
    // const userOrgId = await this.organizationsService.getUserOrgId(req.user.userId);
    // if (userOrgId !== organizationId) throw new ForbiddenException();
    // For now, assuming isSuperAdmin implies access to their org, and we trust the ID they pass matches their context or we check it.
    // Actually, let's just check if the user's organizationId matches the param.
    // But req.user might not have organizationId in the type definition yet?
    // We added it to JwtRequestUser in Phase 2B.
    if (req.user.organizationId !== organizationId) {
      throw new ForbiddenException(
        'You can only invite users to your own organization',
      );
    }

    return this.organizationsService.inviteUser(
      organizationId,
      dto.email,
      dto.role,
      req.user.userId,
    );
  }

  /**
   * List pending invitations (Super Admin only)
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('organizations/:id/invites')
  async getPendingInvites(
    @Param('id') organizationId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    if (!req.user.isSuperAdmin || req.user.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied');
    }
    return this.organizationsService.getPendingInvites(organizationId);
  }

  /**
   * Revoke an invitation (Super Admin only)
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Delete('organizations/:id/invites/:inviteId')
  async revokeInvite(
    @Param('id') organizationId: string,
    @Param('inviteId') inviteId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    if (!req.user.isSuperAdmin || req.user.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied');
    }
    await this.organizationsService.revokeInvite(organizationId, inviteId);
    return { message: 'Invitation revoked' };
  }

  /**
   * Validate an invitation token (Public)
   */
  @Public()
  @Get('invites/:token')
  async validateInvite(@Param('token') token: string) {
    return this.organizationsService.validateInvite(token);
  }

  /**
   * Accept an invitation (Authenticated)
   */
  @UseGuards(JwtAuthGuard)
  @Post('invites/:token/accept')
  async acceptInvite(
    @Param('token') token: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.organizationsService.acceptInvite(token, req.user.userId);
  }
}
