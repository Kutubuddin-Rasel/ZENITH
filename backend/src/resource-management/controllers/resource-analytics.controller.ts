import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ResourceAnalyticsService } from '../services/resource-analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('resource-analytics')
@UseGuards(JwtAuthGuard)
export class ResourceAnalyticsController {
  constructor(private resourceAnalyticsService: ResourceAnalyticsService) {}

  @Get('forecast/:projectId')
  @RequirePermission('resources:view')
  async getResourceForecast(@Param('projectId') projectId: string) {
    const forecast =
      await this.resourceAnalyticsService.predictResourceDemand(projectId);

    return {
      success: true,
      data: forecast,
    };
  }

  @Get('skill-gaps/:teamId')
  @RequirePermission('resources:view')
  async getSkillGaps(@Param('teamId') teamId: string) {
    const analysis =
      await this.resourceAnalyticsService.analyzeSkillGaps(teamId);

    return {
      success: true,
      data: analysis,
    };
  }

  @Post('roi')
  @RequirePermission('resources:view')
  async calculateResourceROI(
    @Body()
    body: {
      projectId: string;
      timeHorizon: number;
      includeOpportunityCost?: boolean;
      discountRate?: number;
    },
  ) {
    const roi = await this.resourceAnalyticsService.calculateResourceROI({
      projectId: body.projectId,
      timeHorizon: body.timeHorizon,
      includeOpportunityCost: body.includeOpportunityCost,
      discountRate: body.discountRate,
    });

    return {
      success: true,
      data: roi,
    };
  }

  @Get('burnout-risk/:userId')
  @RequirePermission('resources:view')
  async getBurnoutRisk(@Param('userId') userId: string) {
    const risk =
      await this.resourceAnalyticsService.identifyBurnoutRisk(userId);

    return {
      success: true,
      data: risk,
    };
  }

  @Get('insights/:organizationId')
  @RequirePermission('resources:view')
  async getResourceInsights(@Param('organizationId') organizationId: string) {
    const insights =
      await this.resourceAnalyticsService.generateResourceInsights(
        organizationId,
      );

    return {
      success: true,
      data: insights,
    };
  }

  @Get('dashboard')
  @RequirePermission('resources:view')
  async getAnalyticsDashboard(@Request() req: { user: { userId: string } }) {
    const userId = req.user.userId;
    const organizationId = 'default'; // This would come from user context

    const [burnoutRisk, insights] = await Promise.all([
      this.resourceAnalyticsService.identifyBurnoutRisk(userId),
      this.resourceAnalyticsService.generateResourceInsights(organizationId),
    ]);

    return {
      success: true,
      data: {
        burnoutRisk,
        insights,
        summary: {
          riskLevel: burnoutRisk.urgency,
          riskScore: burnoutRisk.riskScore,
          averageUtilization: insights.utilization.average,
          totalSpent: insights.costs.totalSpent,
        },
      },
    };
  }

  @Get('trends')
  @RequirePermission('resources:view')
  getResourceTrends(
    @Query('period') period: string = '30d',
    @Query('metric') metric: string = 'utilization',
  ) {
    // This would return trend data for various metrics
    const trends = {
      period,
      metric,
      data: [
        { date: '2024-01-01', value: 75 },
        { date: '2024-01-02', value: 78 },
        { date: '2024-01-03', value: 82 },
        // ... more data points
      ],
      trend: 'increasing',
      change: 7,
    };

    return {
      success: true,
      data: trends,
    };
  }

  @Post('predict-demand')
  @RequirePermission('resources:view')
  predictResourceDemand(
    @Body()
    body: {
      projectType: string;
      complexity: number;
      duration: number;
      teamSize: number;
    },
  ) {
    // This would use ML models to predict resource demand
    const prediction = {
      projectType: body.projectType,
      predictedSkills: [
        { skill: 'JavaScript', level: 4, quantity: 2 },
        { skill: 'React', level: 3, quantity: 1 },
        { skill: 'Node.js', level: 3, quantity: 1 },
      ],
      confidence: 0.85,
      assumptions: [
        'Based on similar projects',
        'Team experience level: intermediate',
        'Standard development practices',
      ],
    };

    return {
      success: true,
      data: prediction,
    };
  }
}
