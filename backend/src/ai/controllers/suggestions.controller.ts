import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SuggestionsService } from '../services/suggestions.service';
import { PredictionAnalyticsService } from '../services/prediction-analytics.service';

/**
 * Controller for AI Suggestions
 * Provides endpoints for users to review and act on AI predictions
 */
@Controller('ai/suggestions')
@UseGuards(JwtAuthGuard)
export class SuggestionsController {
  constructor(
    private readonly suggestionsService: SuggestionsService,
    private readonly predictionAnalyticsService: PredictionAnalyticsService,
  ) {}

  /**
   * Get all pending suggestions for the current user
   */
  @Get()
  async getPendingSuggestions(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.suggestionsService.findAllPending(parsedLimit);
  }

  /**
   * Get pending suggestions for a specific issue
   */
  @Get('issue/:issueId')
  async getSuggestionsForIssue(@Param('issueId') issueId: string) {
    return this.suggestionsService.findPendingForIssue(issueId);
  }

  /**
   * Accept a suggestion and apply changes to the issue
   */
  @Post(':id/accept')
  async acceptSuggestion(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.suggestionsService.accept(id, req.user.userId);
  }

  /**
   * Reject a suggestion
   */
  @Post(':id/reject')
  async rejectSuggestion(
    @Param('id') id: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.suggestionsService.reject(id, req.user.userId);
  }

  /**
   * Get AI prediction accuracy stats (simple)
   */
  @Get('stats/accuracy')
  async getAccuracyStats() {
    return this.suggestionsService.getAccuracyStats();
  }

  /**
   * Shadow Mode Dashboard - comprehensive stats
   */
  @Get('stats/shadow-mode')
  async getShadowModeStats(@Query('days') days?: string) {
    const daysLookback = days ? parseInt(days, 10) : 30;
    return this.predictionAnalyticsService.getShadowModeStats(daysLookback);
  }

  /**
   * Get outliers - high confidence predictions that were wrong
   */
  @Get('stats/outliers')
  async getOutliers(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.predictionAnalyticsService.getOutliers(parsedLimit);
  }

  /**
   * Get predictions pending human review
   */
  @Get('stats/pending-review')
  async getPendingReview(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.predictionAnalyticsService.getPendingReview(parsedLimit);
  }
}
