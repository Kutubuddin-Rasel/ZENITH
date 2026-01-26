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
  Optional,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import {
  ProjectWizardService,
  WizardResponse,
} from '../services/project-wizard.service';
import { CreateProjectWizardDto } from '../dto/create-project-wizard.dto';
import { AIChatRequestDto } from '../dto/ai-chat.dto';
import { TemplateRecommendationService } from '../services/template-recommendation.service';
import { ProjectIntelligenceService } from '../../ai/services/project-intelligence.service';
import { ProjectCategory } from '../entities/project-template.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';

@Controller('api/project-wizard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectWizardController {
  constructor(
    private wizardService: ProjectWizardService,
    private recommendationService: TemplateRecommendationService,
    @Optional() private projectIntelligence?: ProjectIntelligenceService,
  ) {}

  /**
   * AI-powered conversational project setup endpoint
   * Uses intelligent mode by default (context-aware, 6-factor scoring)
   * Falls back to legacy mode if intelligent services unavailable
   */
  @Post('ai-chat')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:create')
  async processAIChat(
    @Request() req: AuthenticatedRequest,
    @Body() body: AIChatRequestDto,
  ) {
    // Check if AI service is available
    if (!this.projectIntelligence) {
      return {
        success: false,
        error: 'AI chat service is not available. Please use the wizard.',
      };
    }

    try {
      // Use intelligent mode by default if available, unless explicitly disabled
      const useIntelligentMode =
        body.useIntelligentMode !== false &&
        this.projectIntelligence.isIntelligentModeAvailable;

      if (useIntelligentMode) {
        // NEW: Intelligent mode with full conversation context and 6-factor scoring
        const response =
          await this.projectIntelligence.processMessageIntelligent(
            body.message,
            body.conversationId,
            req.user?.userId || 'anonymous',
          );

        return {
          success: true,
          data: response,
          mode: 'intelligent',
        };
      }

      // LEGACY: Original processing without conversation context
      const response = await this.projectIntelligence.processMessage({
        message: body.message,
        conversationId: body.conversationId,
        extractedCriteria: body.extractedCriteria,
      });

      return {
        success: true,
        data: response,
        mode: 'legacy',
      };
    } catch (error) {
      console.error('AI Chat error:', error);
      return {
        success: false,
        error: 'Failed to process AI chat. Please try again or use the wizard.',
      };
    }
  }

  @Get('questions')
  @RequirePermission('projects:create')
  @UseInterceptors(CacheInterceptor)
  getWizardQuestions() {
    const questions = this.wizardService.getWizardQuestions();
    return {
      success: true,
      data: questions,
    };
  }

  @Post('process-responses')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:create')
  async processWizardResponses(
    @Request() req: AuthenticatedRequest,
    @Body() body: { responses: WizardResponse[] },
  ) {
    const result = await this.wizardService.processWizardResponses(
      req.user.userId,
      body.responses,
    );
    const { recommendations, suggestedConfig } = result as {
      recommendations: unknown;
      suggestedConfig: unknown;
    };

    return {
      success: true,
      data: {
        recommendations,
        suggestedConfig,
      },
    };
  }

  @Post('create-project')
  @RequirePermission('projects:create')
  async createProjectFromWizard(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateProjectWizardDto,
  ) {
    const project = (await this.wizardService.createProjectFromWizard(
      req.user?.id || req.user?.userId, // Try both fields
      body.wizardData,
      body.templateId,
      req.user?.organizationId,
    )) as unknown;

    return {
      success: true,
      data: project as Record<string, unknown>,
    };
  }

  @Get('templates/recommendations')
  @RequirePermission('projects:view')
  async getTemplateRecommendations(
    @Request() req: AuthenticatedRequest,
    @Param('category') category?: string,
  ) {
    const context = {
      userId: req.user.userId,
      projectType: category,
    };

    const recommendations =
      await this.recommendationService.getRecommendations(context);

    return {
      success: true,
      data: recommendations,
    };
  }

  @Get('templates/category/:category')
  @RequirePermission('projects:view')
  async getTemplatesByCategory(
    @Request() req: AuthenticatedRequest,
    @Param('category') category: string,
  ) {
    const context = {
      userId: req.user.id,
    };

    // This depends on user context, so we might skip caching or rely on manual service cache if implemented.
    // For safety in this automated step, let's leave it uncached or verify service cache.
    // Given the recommendation service uses user context, controller caching is UNSAFE here.
    const templates = await this.recommendationService.getTemplatesByCategory(
      category as ProjectCategory,
      context,
    );

    return {
      success: true,
      data: templates,
    };
  }

  @Get('templates/trending')
  @RequirePermission('projects:view')
  @UseInterceptors(CacheInterceptor)
  async getTrendingTemplates() {
    const templates = await this.recommendationService.getTrendingTemplates(5);

    return {
      success: true,
      data: templates,
    };
  }

  @Get('templates/:id/similar')
  @RequirePermission('projects:view')
  @UseInterceptors(CacheInterceptor)
  async getSimilarTemplates(@Param('id') templateId: string) {
    const templates = await this.recommendationService.getSimilarTemplates(
      templateId,
      3,
    );

    return {
      success: true,
      data: templates,
    };
  }
}
