import { Controller, Post, Body, UseGuards, Request, Param, Req, Patch, Get } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RespondToInviteDto } from './dto/respond-to-invite.dto';
import { ProjectsService } from '../projects/projects.service';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * Create a new invite.
   * Only SuperAdmin or ProjectLead for projectId may call.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invites:create')
  @Post()
  createInvite(@Body() dto: CreateInviteDto, @Req() req: any) {
    return this.invitesService.createInvite({
      ...dto,
      inviterId: req.user.userId,
    });
  }

  /**
   * Revoke a pending invite.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invites:create') // Same perm as creating
  @Patch(':id/revoke')
  async revokeInvite(@Param('id') id: string, @Req() req: any) {
    await this.invitesService.revokeInvite(id, req.user.userId);
    return { message: 'Invite revoked' };
  }

  /**
   * Resend a pending invite notification.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invites:create') // Same perm as creating
  @Post(':id/resend')
  async resendInvite(@Param('id') id: string, @Req() req: any) {
    await this.invitesService.resendInvite(id, req.user.userId);
    return { message: 'Invite notification resent' };
  }

  /**
   * Respond to an invite (accept or reject).
   * Any authenticated user who is the invitee can call this.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id/respond')
  async respondToInvite(
    @Param('id') id: string,
    @Body() dto: RespondToInviteDto,
    @Req() req: any,
  ) {
    await this.invitesService.respondToInvite(id, req.user.userId, dto.accept, dto.reason);
    return { message: `Invite ${dto.accept ? 'accepted' : 'rejected'}` };
  }
}

// Add this controller for project invites
import { Controller as RouteController } from '@nestjs/common';

@RouteController('projects/:projectId/invites')
export class ProjectInvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invites:create')
  @Get()
  async getProjectInvites(@Param('projectId') projectId: string) {
    return this.invitesService.findForProject(projectId);
  }
}
