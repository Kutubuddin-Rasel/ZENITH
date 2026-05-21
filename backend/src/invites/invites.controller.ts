import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateInviteDto } from './dto/create-invite.dto';
import { BulkInviteDto } from './dto/bulk-invite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatelessCsrfGuard } from '../auth/guards/csrf.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RespondToInviteDto } from './dto/respond-to-invite.dto';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import {
  INVITE_COMMAND_TOKEN,
  INVITE_QUERY_TOKEN,
} from './constants/invites.tokens';
import type {
  IInviteCommand,
  IInviteQuery,
} from './interfaces/invites.interfaces';

/**
 * InvitesController
 *
 * Step 3 token-scoped wiring: depends on `IInviteCommand` via
 * `INVITE_COMMAND_TOKEN` instead of the deleted `InvitesService`
 * god-class. The HTTP surface (paths, verbs, status codes, request /
 * response shapes) is unchanged — only the injection contract moves
 * to the ISP token.
 */
@Controller('invites')
export class InvitesController {
  constructor(
    @Inject(INVITE_COMMAND_TOKEN)
    private readonly inviteCommand: IInviteCommand,
  ) {}

  /**
   * Create a new invite.
   * Only SuperAdmin or ProjectLead for projectId may call.
   */
  @UseGuards(JwtAuthGuard, StatelessCsrfGuard, PermissionsGuard)
  @RequirePermission('invites:create')
  @Post()
  createInvite(@Body() dto: CreateInviteDto, @Req() req: AuthenticatedRequest) {
    return this.inviteCommand.createInvite({
      ...dto,
      inviterId: req.user.userId,
    });
  }

  /**
   * Revoke a pending invite.
   */
  @UseGuards(JwtAuthGuard, StatelessCsrfGuard, PermissionsGuard)
  @RequirePermission('invites:create') // Same perm as creating
  @Patch(':id/revoke')
  async revokeInvite(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.inviteCommand.revokeInvite(id, req.user.userId);
    return { message: 'Invite revoked' };
  }

  /**
   * Resend a pending invite notification.
   */
  @UseGuards(JwtAuthGuard, StatelessCsrfGuard, PermissionsGuard)
  @RequirePermission('invites:create') // Same perm as creating
  @Post(':id/resend')
  async resendInvite(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.inviteCommand.resendInvite(id, req.user.userId);
    return { message: 'Invite notification resent' };
  }

  /**
   * Respond to an invite (accept or reject).
   * Any authenticated user who is the invitee can call this.
   */
  @UseGuards(JwtAuthGuard, StatelessCsrfGuard)
  @Patch(':id/respond')
  async respondToInvite(
    @Param('id') id: string,
    @Body() dto: RespondToInviteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.inviteCommand.respondToInvite({
      inviteId: id,
      userId: req.user.userId,
      accept: dto.accept,
      reason: dto.reason,
    });
    return { message: `Invite ${dto.accept ? 'accepted' : 'rejected'}` };
  }

  /**
   * Bulk create invites in a single transactional batch.
   * Returns partial success: { created: [...], failed: [...] }
   */
  @UseGuards(JwtAuthGuard, StatelessCsrfGuard, PermissionsGuard)
  @RequirePermission('invites:create')
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  async bulkInvite(
    @Body() dto: BulkInviteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inviteCommand.bulkInvite({
      projectId: dto.projectId,
      inviterId: req.user.userId,
      entries: dto.invites.map((entry) => ({
        inviteeId: entry.inviteeId,
        email: entry.email,
        role: entry.role ?? dto.defaultRole,
        expiresInHours: dto.expiresInHours,
      })),
    });
  }
}

@Controller('projects/:projectId/invites')
export class ProjectInvitesController {
  constructor(
    @Inject(INVITE_QUERY_TOKEN)
    private readonly inviteQuery: IInviteQuery,
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('invites:view')
  @Get()
  async getProjectInvites(@Param('projectId') projectId: string) {
    return this.inviteQuery.findForProject(projectId);
  }
}
