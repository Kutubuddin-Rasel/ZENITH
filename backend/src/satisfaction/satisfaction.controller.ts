import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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

@Controller('api/satisfaction')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SatisfactionController {
  constructor(private satisfactionService: SatisfactionService) {}

  @Post('track-metric')
  @HttpCode(HttpStatus.OK)
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
    @Param('metric') metric?: string,
  ) {
    const metrics = await this.satisfactionService.getMetrics(
      req.user.userId,
      metric,
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
    @Param('type') type?: string,
  ) {
    const surveys = await this.satisfactionService.getSurveys(
      req.user.userId,
      type,
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
  ) {
    const score = await this.satisfactionService.getAverageScore(
      req.user.userId,
      metric,
    );

    return {
      success: true,
      data: { score },
    };
  }

  @Get('overall-satisfaction')
  @RequirePermission('projects:view')
  async getOverallSatisfaction(@Request() req: AuthenticatedRequest) {
    const score = await this.satisfactionService.getOverallSatisfaction(
      req.user.userId,
    );

    return {
      success: true,
      data: { score },
    };
  }
}
