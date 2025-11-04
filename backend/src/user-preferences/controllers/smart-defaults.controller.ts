import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  SmartDefaultsService,
  SmartDefaultSuggestion,
} from '../services/smart-defaults.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('api/smart-defaults')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SmartDefaultsController {
  constructor(private smartDefaultsService: SmartDefaultsService) {}

  @Get('issue-defaults')
  @RequirePermission('issues:create')
  async getIssueDefaults(
    @Request() req: any,
    @Body()
    body: {
      projectId: string;
      issueType?: string;
      projectType?: string;
      teamMembers?: string[];
    },
  ) {
    const suggestions = await this.smartDefaultsService.getIssueDefaults(
      req.user.id,
      body.projectId,
      {
        issueType: body.issueType,
        projectType: body.projectType,
        teamMembers: body.teamMembers,
      },
    );

    return {
      success: true,
      data: suggestions,
    };
  }

  @Get('project-defaults')
  @RequirePermission('projects:create')
  async getProjectDefaults(
    @Request() req: any,
    @Param('projectType') projectType: string,
  ) {
    const suggestions = await this.smartDefaultsService.getProjectDefaults(
      req.user.id,
      projectType,
    );

    return {
      success: true,
      data: suggestions,
    };
  }

  @Post('learn-behavior')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:view')
  async learnFromBehavior(
    @Request() req: any,
    @Body()
    body: {
      action: string;
      context: Record<string, any>;
      timestamp: Date;
    },
  ) {
    await this.smartDefaultsService.learnFromBehavior(req.user.id, {
      action: body.action,
      context: body.context,
      timestamp: body.timestamp,
    });

    return {
      success: true,
      message: 'Behavior learned successfully',
    };
  }

  @Get('behavior-pattern')
  @RequirePermission('projects:view')
  async getUserBehaviorPattern(@Request() req: any) {
    const pattern = await this.smartDefaultsService.getUserBehaviorPattern(
      req.user.id,
    );

    return {
      success: true,
      data: pattern,
    };
  }
}
