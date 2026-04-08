import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CycleTimeService } from './services/cycle-time.service';
import {
  SprintRiskService,
  SprintRiskResult,
} from './services/sprint-risk.service';
import { AnalyticsJobsService } from './services/analytics-jobs.service';
import {
  HistoricalMetricsService,
  HistoricalMetricPoint,
} from './services/historical-metrics.service';
import { HistoricalMetricsQueryDto } from './dto/historical-metrics-query.dto';
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
    private readonly historicalMetricsService: HistoricalMetricsService,
  ) {}

  @Get('cycle-time')
  async getCycleTime(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('days') days = '30',
  ) {
    return this.cycleTimeService.calculateProjectCycleTime(
      projectId,
      'summary',
      parseInt(days, 10),
    );
  }

  @Get('sprints/:sprintId/risk')
  async getSprintRisk(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sprintId', ParseUUIDPipe) sprintId: string,
    @Request() req: JwtAuthenticatedRequest,
  ): Promise<SprintRiskResult> {
    return this.sprintRiskService.calculateSprintRisk(
      projectId,
      sprintId,
      req.user.userId,
    );
  }

  @Get('stalled-issues')
  async getStalledIssues(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.analyticsJobsService.getStalledIssues(projectId);
  }

  /**
   * PHASE 4: Historical metrics query endpoint.
   *
   * Returns time-series metric snapshots for trend charts.
   * Example: GET /projects/:id/analytics/history?metricType=CYCLE_TIME&startDate=2025-01-01&endDate=2025-06-30
   *
   * SECURITY:
   * - JwtAuthGuard validates the JWT
   * - PermissionsGuard checks project membership
   * - HistoricalMetricsService.getHistoricalMetrics() enforces tenantId
   *   from TenantContext as the FIRST WHERE clause in QueryBuilder
   */
  @Get('history')
  async getHistoricalMetrics(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: HistoricalMetricsQueryDto,
  ): Promise<HistoricalMetricPoint[]> {
    return this.historicalMetricsService.getHistoricalMetrics(
      projectId,
      query.metricType,
      query.startDate,
      query.endDate,
      query.referenceId,
    );
  }
}
