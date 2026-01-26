// src/watchers/watchers.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WatchersService } from './watchers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WatchersController {
  constructor(private svc: WatchersService) {}

  // Project watchers

  @RequirePermission('watchers:update')
  @Post('watchers')
  async toggleProjectWatch(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.toggleProjectWatcher(projectId, req.user.userId);
  }

  @RequirePermission('watchers:view')
  @Get('watchers')
  async listProjectWatchers(
    @Param('projectId') projectId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.listProjectWatchers(projectId, req.user.userId);
  }

  // Issue watchers

  @RequirePermission('watchers:update')
  @Post('issues/:issueId/watchers')
  async toggleIssueWatch(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.toggleIssueWatcher(projectId, issueId, req.user.userId);
  }

  @RequirePermission('watchers:view')
  @Get('issues/:issueId/watchers')
  async listIssueWatchers(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.listIssueWatchers(projectId, issueId, req.user.userId);
  }
}
