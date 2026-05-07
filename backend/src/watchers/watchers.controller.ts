// src/watchers/watchers.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WatchersService } from './watchers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtRequestUser } from '../auth/types/jwt-request-user.interface';
import { StatefulCsrfGuard, RequireCsrf } from '../security/csrf/csrf.guard';
import { BatchWatchIssuesDto, BatchWatchResult } from './dto/batch-watch.dto';
import { WatchPreferenceDto } from './dto/watch-preference.dto';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class WatchersController {
  constructor(private svc: WatchersService) {}

  // Project watchers

  @RequireCsrf()
  @RequirePermission('watchers:update')
  @Post('watchers')
  async toggleProjectWatch(
    @Param('projectId') projectId: string,
    @Body() dto: WatchPreferenceDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.toggleProjectWatcher(
      projectId,
      req.user.userId,
      dto.preference,
    );
  }

  @RequireCsrf()
  @RequirePermission('watchers:update')
  @Post('watchers/batch')
  async batchToggleIssueWatchers(
    @Param('projectId') projectId: string,
    @Body() dto: BatchWatchIssuesDto,
    @Request() req: { user: JwtRequestUser },
  ): Promise<BatchWatchResult> {
    return this.svc.batchToggleIssueWatchers(
      projectId,
      req.user.userId,
      dto.issueIds,
      dto.preference,
    );
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

  @RequireCsrf()
  @RequirePermission('watchers:update')
  @Post('issues/:issueId/watchers')
  async toggleIssueWatch(
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: WatchPreferenceDto,
    @Request() req: { user: JwtRequestUser },
  ) {
    return this.svc.toggleIssueWatcher(
      projectId,
      issueId,
      req.user.userId,
      dto.preference,
    );
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
