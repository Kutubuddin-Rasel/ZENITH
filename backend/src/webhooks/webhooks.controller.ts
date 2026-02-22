import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { ProjectRoleGuard } from '../core/auth/guards/project-role.guard';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';
import { RequireProjectRole } from '../auth/decorators/require-project-role.decorator';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

// ============================================================================
// WEBHOOKS CONTROLLER
//
// SECURITY:
// Guard Stack (in execution order):
//   1. JwtAuthGuard     — Identity (who is this?)
//   2. StatefulCsrfGuard — Integrity (is this a forged cross-site request?)
//   3. PermissionsGuard  — Action RBAC (can they do this action type?)
//   4. ProjectRoleGuard  — Project RBAC (do they have the right role?)
//
// AUTHORIZATION STRATEGY:
// - Project-scoped routes (POST/GET /projects/:projectId/webhooks):
//     → ProjectRoleGuard extracts projectId from route params
//     → @RequireProjectRole enforces minimum role
//
// - Entity-scoped routes (PATCH/DELETE/GET /webhooks/:id):
//     → No projectId in URL → ProjectRoleGuard skips (no decorator)
//     → Service-level authorization resolves webhook → projectId → role check
//
// CSRF:
// - @RequireCsrf() on all mutations (POST, PATCH, DELETE)
// - GET endpoints are exempt (safe methods)
// ============================================================================

@Controller()
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard, ProjectRoleGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // ==========================================================================
  // PROJECT-SCOPED ROUTES — ProjectRoleGuard handles authorization
  // ==========================================================================

  @RequireProjectRole(ProjectRole.PROJECT_LEAD)
  @RequireCsrf()
  @Post('projects/:projectId/webhooks')
  create(
    @Param('projectId') projectId: string,
    @Body() createWebhookDto: CreateWebhookDto,
  ) {
    return this.webhooksService.create(projectId, createWebhookDto);
  }

  @RequireProjectRole(ProjectRole.PROJECT_LEAD, ProjectRole.MEMBER)
  @Get('projects/:projectId/webhooks')
  findAll(@Param('projectId') projectId: string) {
    return this.webhooksService.findAll(projectId);
  }

  // ==========================================================================
  // ENTITY-SCOPED ROUTES — Service-level authorization (no projectId in URL)
  // ==========================================================================

  @Get('webhooks/:id')
  findOne(@Param('id') id: string, @Request() req: { user: JwtRequestUser }) {
    return this.webhooksService.findOne(id, req.user.userId);
  }

  @RequireCsrf()
  @Patch('webhooks/:id')
  update(
    @Param('id') id: string,
    @Body() updates: { url?: string; events?: string[]; isActive?: boolean },
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.webhooksService.update(id, updates, req.user.userId);
  }

  @RequireCsrf()
  @Delete('webhooks/:id')
  async remove(
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.webhooksService.remove(id, req.user.userId);
    return { message: 'Webhook deleted successfully' };
  }

  @RequireCsrf()
  @Post('webhooks/:id/test')
  async test(
    @Param('id') id: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    await this.webhooksService.test(id, req.user.userId);
    return { message: 'Test webhook sent' };
  }

  @Get('webhooks/:id/logs')
  getLogs(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Request() req?: { user: JwtRequestUser },
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.webhooksService.getLogs(id, limitNum, req?.user.userId);
  }
}
