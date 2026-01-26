import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/auth/guards/permissions.guard';
import { RequirePermission } from 'src/auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request.interface';

@Controller('projects/:projectId/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('velocity')
  @RequirePermission('projects:view')
  getVelocity(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.getVelocity(projectId, req.user.userId);
  }

  @Get('burndown')
  @RequirePermission('projects:view')
  getBurndown(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
    @Query('sprintId') sprintId?: string,
  ) {
    return this.reportsService.getBurndown(projectId, req.user.id, sprintId);
  }

  @Get('cumulative-flow')
  @RequirePermission('projects:view')
  getCumulativeFlow(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const daysNumber = days ? parseInt(days, 10) : 30;
    return this.reportsService.getCumulativeFlow(
      projectId,
      req.user.id,
      daysNumber,
    );
  }

  @Get('epic-progress')
  @RequirePermission('projects:view')
  getEpicProgress(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.getEpicProgress(projectId, req.user.userId);
  }

  @Get('issue-breakdown')
  @RequirePermission('projects:view')
  getIssueBreakdown(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reportsService.getIssueBreakdown(projectId, req.user.id);
  }
}
