/**
 * Organizations Controller — HTTP Routing Layer
 *
 * SECURITY FEATURES:
 * - CSRF Protection (StatefulCsrfGuard) on all state-changing endpoints
 * - Rate Limiting (@Throttle) on invite creation to prevent email spam
 * - SuperAdmin + same-org authorization on all admin endpoints
 * - Public endpoint for invite token validation (no auth required)
 *
 * ENDPOINT MAP:
 *   POST   /organizations/:id/invites          [JWT + CSRF + Throttle]  → Create invite
 *   GET    /organizations/:id/invites          [JWT]                    → List pending invites
 *   DELETE /organizations/:id/invites/:inviteId [JWT + CSRF]            → Revoke invite
 *   GET    /organizations/:id/settings          [JWT]                   → Get org settings
 *   PATCH  /organizations/:id/settings          [JWT + CSRF]            → Update org settings
 *   GET    /invites/:token                      [Public]                → Validate invite token
 *   POST   /invites/:token/accept               [JWT + CSRF]            → Accept invite
 *
 * @see OrganizationsService for business logic
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
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrganizationsService } from './organizations.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationSettings } from './entities/organization-settings.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { Public } from '../auth/decorators/public.decorator';
import { CsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';

// =============================================================================
// AUTHORIZATION HELPER
// =============================================================================

/**
 * Asserts that the request user is a SuperAdmin AND belongs to the
 * specified organization. Throws ForbiddenException otherwise.
 *
 * DRY: Extracted because 5 endpoints repeat this exact check.
 */
function assertSuperAdminOfOrg(
  user: JwtRequestUser,
  organizationId: string,
): void {
  if (!user.isSuperAdmin) {
    throw new ForbiddenException('Only Super Admins can access this resource');
  }
  if (user.organizationId !== organizationId) {
    throw new ForbiddenException(
      'You can only manage your own organization',
    );
  }
}

// =============================================================================
// CONTROLLER
// =============================================================================

@Controller()
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly settingsService: OrganizationSettingsService,
  ) {}

  // ===========================================================================
  // INVITATION MANAGEMENT (SuperAdmin only)
  // ===========================================================================

  /**
   * POST /organizations/:id/invites
   *
   * Create an invitation to join the organization.
   *
   * REQUEST LIFECYCLE:
   *   1. ThrottlerGuard (APP_GUARD)  → 100 req/min global
   *   2. @Throttle override          → 10 invites/min (email spam prevention)
   *   3. JwtAuthGuard                → Validate JWT
   *   4. PermissionsGuard            → Check permissions
   *   5. CsrfGuard + @RequireCsrf() → Validate CSRF token
   *   6. Controller                  → SuperAdmin + same-org assertion
   *   7. Service                     → Domain check → Duplicate check → Send email
   *
   * CSRF REQUIRED: State-changing operation (creates invite + sends email)
   * RATE LIMITED: 10/min to prevent email spam
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard, CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 invites/min
  @Post('organizations/:id/invites')
  @RequireCsrf()
  async inviteUser(
    @Param('id') organizationId: string,
    @Body() dto: CreateInviteDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<{ token: string }> {
    assertSuperAdminOfOrg(req.user, organizationId);

    return this.organizationsService.inviteUser(
      organizationId,
      dto.email,
      dto.role,
      req.user.userId,
    );
  }

  /**
   * GET /organizations/:id/invites
   *
   * List pending invitations for the organization.
   * Read-only — no CSRF required.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('organizations/:id/invites')
  async getPendingInvites(
    @Param('id') organizationId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationInvitation[]> {
    assertSuperAdminOfOrg(req.user, organizationId);
    return this.organizationsService.getPendingInvites(organizationId);
  }

  /**
   * DELETE /organizations/:id/invites/:inviteId
   *
   * Revoke a pending invitation.
   *
   * CSRF REQUIRED: Destructive operation (deletes invite record)
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard, CsrfGuard)
  @Delete('organizations/:id/invites/:inviteId')
  @RequireCsrf()
  async revokeInvite(
    @Param('id') organizationId: string,
    @Param('inviteId') inviteId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<{ message: string }> {
    assertSuperAdminOfOrg(req.user, organizationId);
    await this.organizationsService.revokeInvite(organizationId, inviteId);
    return { message: 'Invitation revoked' };
  }

  // ===========================================================================
  // ORGANIZATION SETTINGS (SuperAdmin only)
  // ===========================================================================

  /**
   * GET /organizations/:id/settings
   *
   * Get organization settings. Creates defaults on first access.
   * Read-only — no CSRF required.
   */
  @UseGuards(JwtAuthGuard)
  @Get('organizations/:id/settings')
  async getSettings(
    @Param('id') organizationId: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationSettings> {
    assertSuperAdminOfOrg(req.user, organizationId);
    return this.settingsService.getOrCreate(organizationId);
  }

  /**
   * PATCH /organizations/:id/settings
   *
   * Update organization settings (logo, timezone, visibility, domains, seats).
   *
   * CSRF REQUIRED: State-changing operation
   */
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

  /**
   * GET /invites/:token
   *
   * Validate an invitation token (public endpoint).
   * Used by the frontend to show invite details before the user logs in.
   */
  @Public()
  @Get('invites/:token')
  async validateInvite(
    @Param('token') token: string,
  ): Promise<OrganizationInvitation> {
    return this.organizationsService.validateInvite(token);
  }

  /**
   * POST /invites/:token/accept
   *
   * Accept an invitation and join the organization.
   *
   * CSRF REQUIRED: State-changing operation (modifies user org membership)
   */
  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('invites/:token/accept')
  @RequireCsrf()
  async acceptInvite(
    @Param('token') token: string,
    @Request() req: { user: JwtRequestUser },
  ): Promise<OrganizationInvitation> {
    return this.organizationsService.acceptInvite(token, req.user.userId);
  }
}
