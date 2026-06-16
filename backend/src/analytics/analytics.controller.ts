import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  CYCLE_TIME_QUERY_TOKEN,
  SPRINT_RISK_QUERY_TOKEN,
  STALLED_ISSUES_QUERY_TOKEN,
  HISTORICAL_METRICS_QUERY_TOKEN,
} from './constants/analytics.tokens';
import type {
  ICycleTimeQuery,
  ISprintRiskQuery,
  IStalledIssuesQuery,
  IHistoricalMetricsQuery,
  SprintRiskResult,
  HistoricalMetricPoint,
} from './interfaces/analytics.interfaces';
import { HistoricalMetricsQueryDto } from './dto/historical-metrics-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { JwtAuthenticatedRequest } from '../auth/interface/jwt-authenticated-request.interface';

@Controller('projects/:projectId/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(
    @Inject(CYCLE_TIME_QUERY_TOKEN)
    private readonly cycleTimeService: ICycleTimeQuery,
    @Inject(SPRINT_RISK_QUERY_TOKEN)
    private readonly sprintRiskService: ISprintRiskQuery,
    @Inject(STALLED_ISSUES_QUERY_TOKEN)
    private readonly stalledIssuesService: IStalledIssuesQuery,
    @Inject(HISTORICAL_METRICS_QUERY_TOKEN)
    private readonly historicalMetricsService: IHistoricalMetricsQuery,
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
    return this.stalledIssuesService.getStalledIssues(projectId);
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
