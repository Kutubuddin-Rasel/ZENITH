/**
 * Organizations Controller — HTTP Routing Layer
 *
 * SRP REFACTOR (Step 3):
 * Invite routes now delegate to IInvitationService via INVITATION_SERVICE_TOKEN.
 * Settings routes delegate to OrganizationSettingsService.
 * OrganizationsService is no longer injected (it has no controller surface).
 *
 * @see InvitationService for invitation business logic
 * @see OrganizationSettingsService for settings management
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Inject,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrganizationSettingsService } from './organization-settings.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationSettings } from './entities/organization-settings.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { Public } from '../auth/decorators/public.decorator';
import { CsrfGuard, RequireCsrf } from '../security/csrf';
import { IInvitationService } from './interfaces/organization.interfaces';
import { INVITATION_SERVICE_TOKEN } from './constants/organization.tokens';

// =============================================================================
// AUTHORIZATION HELPER
// =============================================================================

function assertSuperAdminOfOrg(
  user: JwtRequestUser,
  organizationId: string,
): void {
  if (!user.isSuperAdmin) {
    throw new ForbiddenException('Only Super Admins can access this resource');
  }
  if (user.organizationId !== organizationId) {
    throw new ForbiddenException('You can only manage your own organization');
  }
}

// =============================================================================
// CONTROLLER
// =============================================================================

@Controller()
export class OrganizationsController {
  constructor(
    @Inject(INVITATION_SERVICE_TOKEN)
    private readonly invitationService: IInvitationService,
    private readonly settingsService: OrganizationSettingsService,
  ) {}

  // ===========================================================================
  // INVITATION MANAGEMENT (SuperAdmin only)
  // ===========================================================================

  @UseGuards(JwtAuthGuard, PermissionsGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('organizations/:id/invites')
  @RequireCsrf()
  async inviteUser(
    @Param('id') organizationId: string,
    @Body() dto: CreateInviteDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<{ token: string }> {
    assertSuperAdminOfOrg(req.user, organizationId);
    return this.invitationService.inviteUser(
      organizationId,
      dto.email,
      dto.role,
      req.user.userId,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('organizations/:id/invites')
  async getPendingInvites(
    @Param('id') organizationId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationInvitation[]> {
    assertSuperAdminOfOrg(req.user, organizationId);
    return this.invitationService.getPendingInvites(organizationId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard, CsrfGuard)
  @Delete('organizations/:id/invites/:inviteId')
  @RequireCsrf()
  async revokeInvite(
    @Param('id') organizationId: string,
    @Param('inviteId') inviteId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<{ message: string }> {
    assertSuperAdminOfOrg(req.user, organizationId);
    await this.invitationService.revokeInvite(organizationId, inviteId);
    return { message: 'Invitation revoked' };
  }

  // ===========================================================================
  // ORGANIZATION SETTINGS (SuperAdmin only)
  // ===========================================================================

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:id/settings')
  async getSettings(
    @Param('id') organizationId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationSettings> {
    assertSuperAdminOfOrg(req.user, organizationId);
    return this.settingsService.getOrCreate(organizationId);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('organizations/:id/settings')
  @RequireCsrf()
  async updateSettings(
    @Param('id') organizationId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationSettings> {
    assertSuperAdminOfOrg(req.user, organizationId);
    return this.settingsService.update(organizationId, dto);
  }

  // ===========================================================================
  // INVITE TOKEN ENDPOINTS (Public + Authenticated)
  // ===========================================================================

  @Public()
  @Get('invites/:token')
  async validateInvite(
    @Param('token') token: string,
  ): Promise<OrganizationInvitation> {
    return this.invitationService.validateInvite(token);
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('invites/:token/accept')
  @RequireCsrf()
  async acceptInvite(
    @Param('token') token: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationInvitation> {
    return this.invitationService.acceptInvite(token, req.user.userId);
  }
}
