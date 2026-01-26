import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CycleTimeService } from './services/cycle-time.service';
import {
  SprintRiskService,
  SprintRiskResult,
} from './services/sprint-risk.service';
import { AnalyticsJobsService } from './services/analytics-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';

import { JwtAuthenticatedRequest } from '../auth/interface/jwt-authenticated-request.interface';

@Controller('projects/:projectId/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(
    private readonly cycleTimeService: CycleTimeService,
    private readonly sprintRiskService: SprintRiskService,
    private readonly analyticsJobsService: AnalyticsJobsService,
  ) {}

  @Get('cycle-time')
  async getCycleTime(
    @Param('projectId') projectId: string,
    @Query('days') days = '30',
  ) {
    return this.cycleTimeService.calculateProjectCycleTime(
      projectId,
      'summary',
      parseInt(days),
    );
  }

  @Get('sprints/:sprintId/risk')
  async getSprintRisk(
    @Param('projectId') projectId: string,
    @Param('sprintId') sprintId: string,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<SprintRiskResult> {
    return this.sprintRiskService.calculateSprintRisk(
      projectId,
      sprintId,
      req.user.userId,
    );
  }

  @Get('stalled-issues')
  async getStalledIssues(@Param('projectId') projectId: string) {
    return this.analyticsJobsService.getStalledIssues(projectId);
  }
}
