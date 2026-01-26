import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WorkflowAnalyticsService } from '../services/workflow-analytics.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';

@Controller('api/workflow-analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkflowAnalyticsController {
  constructor(private workflowAnalyticsService: WorkflowAnalyticsService) {}

  @Get('workflow/:workflowId/performance')
  @RequirePermission('projects:view')
  async getWorkflowPerformanceMetrics(@Param('workflowId') workflowId: string) {
    try {
      const metrics =
        await this.workflowAnalyticsService.getWorkflowPerformanceMetrics(
          workflowId,
        );

      return {
        success: true,
        data: metrics,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('rule/:ruleId/metrics')
  @RequirePermission('projects:view')
  async getAutomationRuleMetrics(@Param('ruleId') ruleId: string) {
    try {
      const metrics =
        await this.workflowAnalyticsService.getAutomationRuleMetrics(ruleId);

      return {
        success: true,
        data: metrics,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('project/:projectId/analytics')
  @RequirePermission('projects:view')
  async getProjectWorkflowAnalytics(@Param('projectId') projectId: string) {
    try {
      const analytics =
        await this.workflowAnalyticsService.getProjectWorkflowAnalytics(
          projectId,
        );

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

  @Get('system')
  @RequirePermission('projects:view')
  async getSystemAnalytics() {
    try {
      const analytics =
        await this.workflowAnalyticsService.getSystemAnalytics();

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

  @Get('workflow/:workflowId/executions')
  @RequirePermission('projects:view')
  async getWorkflowExecutionHistory(
    @Param('workflowId') workflowId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    try {
      const executions =
        await this.workflowAnalyticsService.getWorkflowExecutionHistory(
          workflowId,
          limit || 50,
          offset || 0,
        );

      return {
        success: true,
        data: executions,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('project/:projectId/alerts')
  @RequirePermission('projects:view')
  async getPerformanceAlerts(@Param('projectId') projectId: string) {
    try {
      const alerts =
        await this.workflowAnalyticsService.getPerformanceAlerts(projectId);

      return {
        success: true,
        data: alerts,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('project/:projectId/report')
  @RequirePermission('projects:view')
  async generatePerformanceReport(
    @Param('projectId') projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    try {
      const report =
        await this.workflowAnalyticsService.generatePerformanceReport(
          projectId,
          new Date(startDate),
          new Date(endDate),
        );

      return {
        success: true,
        data: report,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
