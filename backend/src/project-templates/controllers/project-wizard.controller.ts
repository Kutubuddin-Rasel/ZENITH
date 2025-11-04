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
import {
  ProjectWizardService,
  WizardResponse,
  ProjectWizardData,
} from '../services/project-wizard.service';
import { TemplateRecommendationService } from '../services/template-recommendation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('api/project-wizard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectWizardController {
  constructor(
    private wizardService: ProjectWizardService,
    private recommendationService: TemplateRecommendationService,
  ) {}

  @Get('questions')
  @RequirePermission('projects:create')
  async getWizardQuestions(@Request() req: any) {
    const questions = await this.wizardService.getWizardQuestions(req.user.id);
    return {
      success: true,
      data: questions,
    };
  }

  @Post('process-responses')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:create')
  async processWizardResponses(
    @Request() req: any,
    @Body() body: { responses: WizardResponse[] },
  ) {
    const { recommendations, suggestedConfig } =
      await this.wizardService.processWizardResponses(
        req.user.id,
        body.responses,
      );

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
    @Request() req: any,
    @Body()
    body: {
      wizardData: ProjectWizardData;
      templateId: string;
    },
  ) {
    const project = await this.wizardService.createProjectFromWizard(
      req.user.id,
      body.wizardData,
      body.templateId,
    );

    return {
      success: true,
      data: project,
    };
  }

  @Get('templates/recommendations')
  @RequirePermission('projects:view')
  async getTemplateRecommendations(
    @Request() req: any,
    @Param('category') category?: string,
  ) {
    const context = {
      userId: req.user.id,
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
    @Request() req: any,
    @Param('category') category: string,
  ) {
    const context = {
      userId: req.user.id,
    };

    const templates = await this.recommendationService.getTemplatesByCategory(
      category as any,
      context,
    );

    return {
      success: true,
      data: templates,
    };
  }

  @Get('templates/trending')
  @RequirePermission('projects:view')
  async getTrendingTemplates() {
    const templates = await this.recommendationService.getTrendingTemplates(5);

    return {
      success: true,
      data: templates,
    };
  }

  @Get('templates/:id/similar')
  @RequirePermission('projects:view')
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
