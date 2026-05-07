import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SatisfactionService } from './satisfaction.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';
import {
  StatefulCsrfGuard,
  RequireCsrf,
} from '../security/csrf/csrf.guard';
import { TimeRangeDto } from './dto/time-range.dto';

/**
 * Satisfaction Controller
 *
 * Guard chain:
 *   1. JwtAuthGuard      — Identity verification (JWT Bearer)
 *   2. StatefulCsrfGuard — CSRF integrity check (reads @RequireCsrf metadata)
 *   3. PermissionsGuard  — RBAC permission check
 *
 * StatefulCsrfGuard is metadata-driven: it checks if the handler has
 * @RequireCsrf() metadata and skips validation if absent. This means
 * GET endpoints pass through without CSRF validation while POST
 * endpoints are protected.
 */
@Controller('api/satisfaction')
@UseGuards(JwtAuthGuard, StatefulCsrfGuard, PermissionsGuard)
export class SatisfactionController {
  constructor(private satisfactionService: SatisfactionService) {}

  @Post('track-metric')
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequirePermission('projects:view')
  async trackMetric(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      metric: string;
      value: number;
      context?: Record<string, unknown>;
      timestamp: Date;
    },
  ) {
    const metric = await this.satisfactionService.trackMetric(
      req.user.userId,
      body.metric,
      body.value,
      body.context,
    );

    return {
      success: true,
      data: metric,
    };
  }

  @Post('submit-survey')
  @RequireCsrf()
  @RequirePermission('projects:view')
  async submitSurvey(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      type: 'onboarding' | 'feature' | 'general';
      questions: Array<{
        id: string;
        question: string;
        answer: number;
        context?: string;
      }>;
      overallScore: number;
      feedback?: string;
      timestamp: Date;
    },
  ) {
    const survey = await this.satisfactionService.submitSurvey(
      req.user.userId,
      body.type,
      body.questions,
      body.overallScore,
      body.feedback,
    );

    return {
      success: true,
      data: survey,
    };
  }

  @Get('metrics')
  @RequirePermission('projects:view')
  async getMetrics(
    @Request() req: AuthenticatedRequest,
    @Query('metric') metric?: string,
    @Query() timeRange?: TimeRangeDto,
  ) {
    const metrics = await this.satisfactionService.getMetrics(
      req.user.userId,
      metric,
      timeRange,
    );

    return {
      success: true,
      data: metrics,
    };
  }

  @Get('surveys')
  @RequirePermission('projects:view')
  async getSurveys(
    @Request() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query() timeRange?: TimeRangeDto,
  ) {
    const surveys = await this.satisfactionService.getSurveys(
      req.user.userId,
      type,
      timeRange,
    );

    return {
      success: true,
      data: surveys,
    };
  }

  @Get('average-score/:metric')
  @RequirePermission('projects:view')
  async getAverageScore(
    @Request() req: AuthenticatedRequest,
    @Param('metric') metric: string,
    @Query() timeRange?: TimeRangeDto,
  ) {
    const score = await this.satisfactionService.getAverageScore(
      req.user.userId,
      metric,
      timeRange,
    );

    return {
      success: true,
      data: { score },
    };
  }

  @Get('overall-satisfaction')
  @RequirePermission('projects:view')
  async getOverallSatisfaction(
    @Request() req: AuthenticatedRequest,
    @Query() timeRange?: TimeRangeDto,
  ) {
    const score = await this.satisfactionService.getOverallSatisfaction(
      req.user.userId,
      timeRange,
    );

    return {
      success: true,
      data: { score },
    };
  }

  /**
   * GET /api/satisfaction/nps/:orgId
   * Returns the Net Promoter Score for an organization.
   * NPS = ((Promoters - Detractors) / Total) × 100
   *
   * Score bands: Promoters (9-10), Passives (7-8), Detractors (0-6)
   * Accepts optional startDate/endDate query params for trend analysis.
   */
  @Get('nps/:orgId')
  @RequirePermission('projects:view')
  async getNps(
    @Param('orgId') orgId: string,
    @Query() timeRange?: TimeRangeDto,
  ) {
    const nps = await this.satisfactionService.calculateNps(orgId, timeRange);

    return {
      success: true,
      data: nps,
    };
  }

  // ── Admin Reporting ───────────────────────────────────────────────

  /**
   * GET /api/satisfaction/admin/org/:orgId/overview
   *
   * Organization-wide satisfaction overview for admin dashboards.
   *
   * Returns:
   *   - NPS score with promoter/passive/detractor breakdown
   *   - Satisfaction by survey type (average score + response count)
   *   - Overall average satisfaction score
   *   - Total response count
   *   - Applied time range (null if all-time)
   *
   * Security:
   *   - Requires 'satisfaction:admin' permission (org admin / super admin)
   *   - Standard users cannot access org-wide metrics
   *
   * Time-range filtering:
   *   GET /api/satisfaction/admin/org/:orgId/overview?startDate=2026-01-01&endDate=2026-03-31
   *   Omit both dates for all-time overview.
   */
  @Get('admin/org/:orgId/overview')
  @RequirePermission('satisfaction:admin')
  async getAdminOverview(
    @Param('orgId') orgId: string,
    @Query() timeRange?: TimeRangeDto,
  ) {
    const overview = await this.satisfactionService.getAdminOverview(
      orgId,
      timeRange,
    );

    return {
      success: true,
      data: overview,
    };
  }
}
