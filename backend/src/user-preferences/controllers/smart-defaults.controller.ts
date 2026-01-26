import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SmartDefaultsService } from '../services/smart-defaults.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.interface';
import { UserPreferencesData } from '../entities/user-preferences.entity';

@Controller('api/smart-defaults')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SmartDefaultsController {
  constructor(private smartDefaultsService: SmartDefaultsService) {}

  @Post('issue-defaults')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('issues:create')
  async getIssueDefaults(
    @Request() req: AuthenticatedRequest,
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

  @Post('project-defaults')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:create')
  async getProjectDefaults(
    @Request() req: AuthenticatedRequest,
    @Body('projectType') projectType: string,
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
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      action: string;
      context: Record<string, unknown>;
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
  async getUserBehaviorPattern(@Request() req: AuthenticatedRequest) {
    const pattern = await this.smartDefaultsService.getUserBehaviorPattern(
      req.user.id,
    );

    return {
      success: true,
      data: pattern,
    };
  }

  @Get('preferences')
  async getUserPreferences(@Request() req: AuthenticatedRequest) {
    const preferences = await this.smartDefaultsService.getUserPreferences(
      req.user.id,
    );

    return {
      success: true,
      data: preferences,
    };
  }

  @Post('preferences')
  @HttpCode(HttpStatus.OK)
  async updateUserPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() body: Partial<UserPreferencesData>,
  ) {
    const preferences = await this.smartDefaultsService.updateUserPreferences(
      req.user.id,
      body,
    );

    return {
      success: true,
      data: preferences,
      message: 'Preferences updated successfully',
    };
  }
}
