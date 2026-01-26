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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AutomationRulesService } from '../services/automation-rules.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('api/automation-rules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutomationRulesController {
  constructor(private automationRulesService: AutomationRulesService) {}

  @Post()
  @RequirePermission('projects:edit')
  async createRule(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      projectId: string;
      name: string;
      description?: string;
      triggerType: string;
      triggerConfig: any;
      conditions?: any;
      actions: any;
      tags?: string[];
      category?: string;
    },
  ) {
    try {
      const rule = await this.automationRulesService.createRule(
        body.projectId,
        req.user.id,
        body,
      );

      return {
        success: true,
        data: rule,
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
  async getRules(
    @Query('projectId') projectId: string,
    @Query('isActive') isActive?: boolean,
    @Query('triggerType') triggerType?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    try {
      const rules = await this.automationRulesService.getRules(projectId, {
        isActive,
        triggerType,
        category,
        search,
      });

      return {
        success: true,
        data: rules,
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
  async getRule(@Param('id') id: string) {
    try {
      const rule = await this.automationRulesService.getRuleById(id);

      return {
        success: true,
        data: rule,
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
  async updateRule(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      name?: string;
      description?: string;
      triggerConfig?: any;
      conditions?: any;
      actions?: any;
      isActive?: boolean;
      tags?: string[];
      category?: string;
    },
  ) {
    try {
      const rule = await this.automationRulesService.updateRule(
        id,
        req.user.id,
        body,
      );

      return {
        success: true,
        data: rule,
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
  async deleteRule(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    try {
      await this.automationRulesService.deleteRule(id, req.user.id);

      return {
        success: true,
        message: 'Rule deleted successfully',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/toggle')
  @RequirePermission('projects:edit')
  async toggleRule(
    @Param('id') id: string,
    @Request() req: { user: { id: string } },
  ) {
    try {
      const rule = await this.automationRulesService.toggleRule(
        id,
        req.user.id,
      );

      return {
        success: true,
        data: rule,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('projects:edit')
  async executeRule(
    @Param('id') id: string,
    @Body()
    body: {
      context: Record<string, unknown>;
    },
  ) {
    try {
      const result = await this.automationRulesService.executeRule(
        id,
        body.context,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post(':id/test')
  @RequirePermission('projects:edit')
  async testRule(
    @Param('id') id: string,
    @Body()
    body: {
      testContext: Record<string, unknown>;
    },
  ) {
    try {
      const result = await this.automationRulesService.testRule(
        id,
        body.testContext,
      );

      return {
        success: true,
        data: result,
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
  async getRuleAnalytics(@Param('id') id: string) {
    try {
      const analytics = await this.automationRulesService.getRuleAnalytics(id);

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

  @Get('categories')
  @RequirePermission('projects:view')
  getCategories() {
    // Return available rule categories
    const categories = [
      'issue_management',
      'notification',
      'assignment',
      'status_update',
      'time_based',
      'integration',
      'approval',
      'escalation',
    ];

    return {
      success: true,
      data: categories,
    };
  }

  @Get('trigger-types')
  @RequirePermission('projects:view')
  getTriggerTypes() {
    // Return available trigger types
    const triggerTypes = [
      {
        id: 'field_change',
        name: 'Field Change',
        description: 'Triggered when a field value changes',
        icon: 'pencil-square',
      },
      {
        id: 'time_based',
        name: 'Time Based',
        description: 'Triggered at specific times or intervals',
        icon: 'clock',
      },
      {
        id: 'user_action',
        name: 'User Action',
        description: 'Triggered by user actions',
        icon: 'user',
      },
      {
        id: 'external_event',
        name: 'External Event',
        description: 'Triggered by external webhooks or events',
        icon: 'globe-alt',
      },
      {
        id: 'scheduled',
        name: 'Scheduled',
        description: 'Triggered on a schedule',
        icon: 'calendar',
      },
    ];

    return {
      success: true,
      data: triggerTypes,
    };
  }

  @Get('action-types')
  @RequirePermission('projects:view')
  getActionTypes() {
    // Return available action types
    const actionTypes = [
      {
        id: 'update_field',
        name: 'Update Field',
        description: 'Update a field value',
        icon: 'pencil',
      },
      {
        id: 'send_notification',
        name: 'Send Notification',
        description: 'Send a notification to users',
        icon: 'bell',
      },
      {
        id: 'assign_user',
        name: 'Assign User',
        description: 'Assign a user to an issue or task',
        icon: 'user-plus',
      },
      {
        id: 'create_issue',
        name: 'Create Issue',
        description: 'Create a new issue or task',
        icon: 'plus-circle',
      },
      {
        id: 'update_status',
        name: 'Update Status',
        description: 'Update the status of an issue or task',
        icon: 'arrow-right-circle',
      },
      {
        id: 'send_email',
        name: 'Send Email',
        description: 'Send an email notification',
        icon: 'envelope',
      },
      {
        id: 'webhook_call',
        name: 'Webhook Call',
        description: 'Make a webhook call to external service',
        icon: 'globe-alt',
      },
      {
        id: 'delay',
        name: 'Delay',
        description: 'Add a delay before next action',
        icon: 'clock',
      },
    ];

    return {
      success: true,
      data: actionTypes,
    };
  }
}
