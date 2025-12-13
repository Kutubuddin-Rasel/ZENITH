import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  WorkflowTemplateService,
  TemplateSearchFilters,
} from '../services/workflow-template.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('api/workflow-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkflowTemplatesController {
  constructor(private workflowTemplateService: WorkflowTemplateService) {}

  @Post()
  @RequirePermission('projects:edit')
  async createTemplate(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      name: string;
      description?: string;
      category: string;
      templateDefinition: any;
      metadata?: any;
      isPublic?: boolean;
      tags?: string[];
      icon?: string;
      color?: string;
      instructions?: string;
      requirements?: any;
    },
  ) {
    try {
      const template = await this.workflowTemplateService.createTemplate(
        req.user.id,
        body,
      );

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get()
  @RequirePermission('projects:view')
  async getTemplates(
    @Query('category') category?: string,
    @Query('tags') tags?: string,
    @Query('complexity') complexity?: string,
    @Query('isPublic') isPublic?: boolean,
    @Query('search') search?: string,
    @Query('minRating') minRating?: number,
    @Query('createdBy') createdBy?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    try {
      const filters = {
        category,
        tags: tags ? tags.split(',') : undefined,
        complexity: complexity,
        isPublic,
        search,
        minRating,
        createdBy,
      };

      const result = await this.workflowTemplateService.getTemplates(
        filters as TemplateSearchFilters,
        limit || 20,
        offset || 0,
      );

      return {
        success: true,
        data: result.templates,
        total: result.total,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('system')
  @RequirePermission('projects:view')
  async getSystemTemplates() {
    try {
      const templates = await this.workflowTemplateService.getSystemTemplates();

      return {
        success: true,
        data: templates,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('popular')
  @RequirePermission('projects:view')
  async getPopularTemplates(@Query('limit') limit?: number) {
    try {
      const templates = await this.workflowTemplateService.getPopularTemplates(
        limit || 10,
      );

      return {
        success: true,
        data: templates,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('featured')
  @RequirePermission('projects:view')
  async getFeaturedTemplates(@Query('limit') limit?: number) {
    try {
      const templates = await this.workflowTemplateService.getFeaturedTemplates(
        limit || 5,
      );

      return {
        success: true,
        data: templates,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('categories')
  @RequirePermission('projects:view')
  async getCategories() {
    try {
      const categories =
        await this.workflowTemplateService.getTemplateCategories();

      return {
        success: true,
        data: categories,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get(':id')
  @RequirePermission('projects:view')
  async getTemplate(@Param('id') id: string) {
    try {
      const template = await this.workflowTemplateService.getTemplateById(id);

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Put(':id')
  @RequirePermission('projects:edit')
  async updateTemplate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      name?: string;
      description?: string;
      category?: string;
      templateDefinition?: any;
      metadata?: any;
      isPublic?: boolean;
      tags?: string[];
      icon?: string;
      color?: string;
      instructions?: string;
      requirements?: any;
    },
  ) {
    try {
      const template = await this.workflowTemplateService.updateTemplate(
        id,
        req.user.id,
        body,
      );

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/publish')
  @RequirePermission('projects:edit')
  async publishTemplate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    try {
      const template = await this.workflowTemplateService.publishTemplate(
        id,
        req.user.id,
      );

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/archive')
  @RequirePermission('projects:edit')
  async archiveTemplate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    try {
      const template = await this.workflowTemplateService.archiveTemplate(
        id,
        req.user.id,
      );

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Delete(':id')
  @RequirePermission('projects:edit')
  async deleteTemplate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    try {
      await this.workflowTemplateService.deleteTemplate(id, req.user.id);

      return {
        success: true,
        message: 'Template deleted successfully',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/duplicate')
  @RequirePermission('projects:edit')
  async duplicateTemplate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body() body: { newName: string },
  ) {
    try {
      const template = await this.workflowTemplateService.duplicateTemplate(
        id,
        req.user.id,
        body.newName,
      );

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/create-workflow')
  @RequirePermission('projects:edit')
  async createWorkflowFromTemplate(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      projectId: string;
      customizations?: Record<string, unknown>;
    },
  ) {
    try {
      const workflow =
        await this.workflowTemplateService.createWorkflowFromTemplate(
          id,
          body.projectId,
          req.user.id,
          body.customizations,
        );

      return {
        success: true,
        data: workflow,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/review')
  @RequirePermission('projects:view')
  async addTemplateReview(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      rating: number;
      comment: string;
    },
  ) {
    try {
      const template = await this.workflowTemplateService.addTemplateReview(
        id,
        req.user.id,
        body,
      );

      return {
        success: true,
        data: template,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get(':id/analytics')
  @RequirePermission('projects:view')
  async getTemplateAnalytics(@Param('id') id: string) {
    try {
      const analytics =
        await this.workflowTemplateService.getTemplateUsageStats(id);

      return {
        success: true,
        data: analytics,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
