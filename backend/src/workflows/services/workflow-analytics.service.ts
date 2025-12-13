import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from '../entities/workflow.entity';
import {
  WorkflowExecution,
  ExecutionStatus,
} from '../entities/workflow-execution.entity';
import { AutomationRule } from '../entities/automation-rule.entity';
import {
  WorkflowTemplate,
  WorkflowTemplateStatus,
} from '../entities/workflow-template.entity';

export interface WorkflowPerformanceMetrics {
  workflowId: string;
  workflowName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  medianExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  lastExecutedAt: Date;
  errorRate: number;
  mostCommonErrors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
}

export interface AutomationRuleMetrics {
  ruleId: string;
  ruleName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  lastExecutedAt: Date;
  errorRate: number;
  triggerFrequency: number;
  mostCommonErrors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
}

export interface ProjectWorkflowAnalytics {
  projectId: string;
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  totalAutomationRules: number;
  activeAutomationRules: number;
  overallSuccessRate: number;
  averageExecutionTime: number;
  mostUsedWorkflows: Array<{
    workflowId: string;
    workflowName: string;
    executionCount: number;
    successRate: number;
  }>;
  mostUsedTemplates: Array<{
    templateId: string;
    templateName: string;
    usageCount: number;
    averageRating: number;
  }>;
  performanceTrends: Array<{
    date: string;
    executions: number;
    successRate: number;
    averageTime: number;
  }>;
}

export interface SystemAnalytics {
  totalWorkflows: number;
  totalExecutions: number;
  totalAutomationRules: number;
  totalTemplates: number;
  activeUsers: number;
  systemSuccessRate: number;
  averageExecutionTime: number;
  topCategories: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  topTemplates: Array<{
    templateId: string;
    templateName: string;
    usageCount: number;
    rating: number;
  }>;
  performanceMetrics: {
    dailyExecutions: number;
    weeklyExecutions: number;
    monthlyExecutions: number;
    errorRate: number;
    averageResponseTime: number;
  };
}

@Injectable()
export class WorkflowAnalyticsService {
  private readonly logger = new Logger(WorkflowAnalyticsService.name);

  constructor(
    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private executionRepo: Repository<WorkflowExecution>,
    @InjectRepository(AutomationRule)
    private ruleRepo: Repository<AutomationRule>,
    @InjectRepository(WorkflowTemplate)
    private templateRepo: Repository<WorkflowTemplate>,
  ) {}

  async getWorkflowPerformanceMetrics(
    workflowId: string,
  ): Promise<WorkflowPerformanceMetrics> {
    const workflow = await this.workflowRepo.findOne({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const executions = await this.executionRepo.find({
      where: { workflowId },
      order: { startedAt: 'DESC' },
    });

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(
      (e) => e.status === ExecutionStatus.COMPLETED,
    ).length;
    const failedExecutions = executions.filter(
      (e) => e.status === ExecutionStatus.FAILED,
    ).length;
    const successRate =
      totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
    const errorRate = 100 - successRate;

    const executionTimes = executions
      .filter((e) => e.executionTime !== undefined)
      .map((e) => e.executionTime!);

    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((sum, time) => sum + (time || 0), 0) /
          executionTimes.length
        : 0;

    const sortedTimes = executionTimes.sort((a, b) => a - b);
    const medianExecutionTime =
      sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length / 2)]
        : 0;

    const p95ExecutionTime =
      sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length * 0.95)]
        : 0;

    const p99ExecutionTime =
      sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length * 0.99)]
        : 0;

    const errorMessages = executions
      .filter((e) => e.errorMessage !== undefined)
      .map((e) => e.errorMessage!);

    const errorCounts = errorMessages.reduce(
      (acc, error) => {
        acc[error] = (acc[error] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const mostCommonErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({
        error,
        count,
        percentage: (count / totalExecutions) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const lastExecutedAt =
      executions.length > 0 ? executions[0].startedAt : workflow.createdAt;

    return {
      workflowId,
      workflowName: workflow.name,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate: parseFloat(successRate.toFixed(2)),
      averageExecutionTime: parseFloat(averageExecutionTime.toFixed(2)),
      medianExecutionTime: parseFloat((medianExecutionTime || 0).toFixed(2)),
      p95ExecutionTime: parseFloat((p95ExecutionTime || 0).toFixed(2)),
      p99ExecutionTime: parseFloat((p99ExecutionTime || 0).toFixed(2)),
      lastExecutedAt,
      errorRate: parseFloat(errorRate.toFixed(2)),
      mostCommonErrors,
    };
  }

  async getAutomationRuleMetrics(
    ruleId: string,
  ): Promise<AutomationRuleMetrics> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new Error('Automation rule not found');
    }

    const totalExecutions = rule.executionCount;
    const successfulExecutions = Math.round(
      ((rule.successRate || 0) * totalExecutions) / 100,
    );
    const failedExecutions = totalExecutions - successfulExecutions;
    const successRate = rule.successRate || 0;
    const errorRate = 100 - successRate;

    // Calculate trigger frequency (executions per day)
    const daysSinceCreation = Math.max(
      1,
      Math.floor(
        (Date.now() - rule.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const triggerFrequency = totalExecutions / daysSinceCreation;

    return {
      ruleId,
      ruleName: rule.name,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate: parseFloat(successRate.toFixed(2)),
      averageExecutionTime: rule.averageExecutionTime || 0,
      lastExecutedAt: rule.lastExecutedAt || rule.createdAt,
      errorRate: parseFloat(errorRate.toFixed(2)),
      triggerFrequency: parseFloat(triggerFrequency.toFixed(2)),
      mostCommonErrors: rule.lastError
        ? [
            {
              error: rule.lastError,
              count: 1,
              percentage: 100,
            },
          ]
        : [],
    };
  }

  async getProjectWorkflowAnalytics(
    projectId: string,
  ): Promise<ProjectWorkflowAnalytics> {
    const workflows = await this.workflowRepo.find({
      where: { projectId },
    });

    const executions = await this.executionRepo
      .createQueryBuilder('execution')
      .leftJoin('execution.workflow', 'workflow')
      .where('workflow.projectId = :projectId', { projectId })
      .getMany();

    const rules = await this.ruleRepo.find({
      where: { projectId },
    });

    const totalWorkflows = workflows.length;
    const activeWorkflows = workflows.filter((w) => w.isActive).length;
    const totalExecutions = executions.length;
    const totalAutomationRules = rules.length;
    const activeAutomationRules = rules.filter((r) => r.isActive).length;

    const successfulExecutions = executions.filter(
      (e) => e.status === ExecutionStatus.COMPLETED,
    ).length;
    const overallSuccessRate =
      totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const executionTimes = executions
      .filter((e) => e.executionTime !== undefined)
      .map((e) => e.executionTime!);
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((sum, time) => sum + (time || 0), 0) /
          executionTimes.length
        : 0;

    // Most used workflows
    const workflowUsage = workflows
      .map((workflow) => {
        const workflowExecutions = executions.filter(
          (e) => e.workflowId === workflow.id,
        );
        const workflowSuccessRate =
          workflowExecutions.length > 0
            ? (workflowExecutions.filter(
                (e) => e.status === ExecutionStatus.COMPLETED,
              ).length /
                workflowExecutions.length) *
              100
            : 0;

        return {
          workflowId: workflow.id,
          workflowName: workflow.name,
          executionCount: workflowExecutions.length,
          successRate: parseFloat(workflowSuccessRate.toFixed(2)),
        };
      })
      .sort((a, b) => b.executionCount - a.executionCount);

    // Most used templates (would need to track template usage)
    const mostUsedTemplates = [];

    // Performance trends (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentExecutions = executions.filter(
      (e) => e.startedAt >= thirtyDaysAgo,
    );

    const performanceTrends: Array<{
      date: string;
      executions: number;
      successRate: number;
      averageTime: number;
    }> = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayExecutions = recentExecutions.filter(
        (e) => e.startedAt >= dayStart && e.startedAt < dayEnd,
      );

      const daySuccessRate =
        dayExecutions.length > 0
          ? (dayExecutions.filter((e) => e.status === ExecutionStatus.COMPLETED)
              .length /
              dayExecutions.length) *
            100
          : 0;

      const dayAverageTime =
        dayExecutions.length > 0
          ? dayExecutions
              .filter((e) => e.executionTime !== undefined)
              .reduce((sum, e) => sum + (e.executionTime || 0), 0) /
            dayExecutions.filter((e) => e.executionTime !== undefined).length
          : 0;

      performanceTrends.push({
        date: dayStart.toISOString().split('T')[0],
        executions: dayExecutions.length,
        successRate: parseFloat(daySuccessRate.toFixed(2)),
        averageTime: parseFloat(dayAverageTime.toFixed(2)),
      });
    }

    return {
      projectId,
      totalWorkflows,
      activeWorkflows,
      totalExecutions,
      totalAutomationRules,
      activeAutomationRules,
      overallSuccessRate: parseFloat(overallSuccessRate.toFixed(2)),
      averageExecutionTime: parseFloat(averageExecutionTime.toFixed(2)),
      mostUsedWorkflows: workflowUsage.slice(0, 10),
      mostUsedTemplates,
      performanceTrends,
    };
  }

  async getSystemAnalytics(): Promise<SystemAnalytics> {
    const workflows = await this.workflowRepo.find();
    const executions = await this.executionRepo.find();
    const rules = await this.ruleRepo.find();
    const templates = await this.templateRepo.find();

    const totalWorkflows = workflows.length;
    const totalExecutions = executions.length;
    const totalAutomationRules = rules.length;
    const totalTemplates = templates.length;

    const successfulExecutions = executions.filter(
      (e) => e.status === ExecutionStatus.COMPLETED,
    ).length;
    const systemSuccessRate =
      totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    const executionTimes = executions
      .filter((e) => e.executionTime !== undefined)
      .map((e) => e.executionTime!);
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((sum, time) => sum + (time || 0), 0) /
          executionTimes.length
        : 0;

    // Top categories
    const categoryCounts = workflows.reduce(
      (acc, workflow) => {
        const category = workflow.category || 'uncategorized';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topCategories = Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / totalWorkflows) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top templates
    const topTemplates = templates
      .filter(
        (t) => t.isPublic && t.status === WorkflowTemplateStatus.PUBLISHED,
      )
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map((template) => ({
        templateId: template.id,
        templateName: template.name,
        usageCount: template.usageCount,
        rating: template.rating || 0,
      }));

    // Performance metrics
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dailyExecutions = executions.filter(
      (e) => e.startedAt >= oneDayAgo,
    ).length;
    const weeklyExecutions = executions.filter(
      (e) => e.startedAt >= oneWeekAgo,
    ).length;
    const monthlyExecutions = executions.filter(
      (e) => e.startedAt >= oneMonthAgo,
    ).length;

    const errorRate = 100 - systemSuccessRate;
    const averageResponseTime = averageExecutionTime;

    return {
      totalWorkflows,
      totalExecutions,
      totalAutomationRules,
      totalTemplates,
      activeUsers: 0, // Would need to calculate from user activity
      systemSuccessRate: parseFloat(systemSuccessRate.toFixed(2)),
      averageExecutionTime: parseFloat(averageExecutionTime.toFixed(2)),
      topCategories,
      topTemplates,
      performanceMetrics: {
        dailyExecutions,
        weeklyExecutions,
        monthlyExecutions,
        errorRate: parseFloat(errorRate.toFixed(2)),
        averageResponseTime: parseFloat(averageResponseTime.toFixed(2)),
      },
    };
  }

  async getWorkflowExecutionHistory(
    workflowId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<WorkflowExecution[]> {
    return this.executionRepo.find({
      where: { workflowId },
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getPerformanceAlerts(projectId: string): Promise<
    Array<{
      type: 'error_rate' | 'execution_time' | 'failure_rate';
      severity: 'low' | 'medium' | 'high';
      message: string;
      value: number;
      threshold: number;
      workflowId?: string;
      ruleId?: string;
    }>
  > {
    const alerts: Array<{
      type: 'error_rate' | 'execution_time' | 'failure_rate';
      severity: 'low' | 'medium' | 'high';
      message: string;
      value: number;
      threshold: number;
      workflowId?: string;
      ruleId?: string;
    }> = [];

    // Check workflow performance
    const workflows = await this.workflowRepo.find({
      where: { projectId },
    });

    for (const workflow of workflows) {
      const metrics = await this.getWorkflowPerformanceMetrics(workflow.id);

      // High error rate alert
      if (metrics.errorRate > 20) {
        alerts.push({
          type: 'error_rate',
          severity: metrics.errorRate > 50 ? 'high' : 'medium',
          message: `Workflow "${workflow.name}" has high error rate: ${metrics.errorRate}%`,
          value: metrics.errorRate,
          threshold: 20,
          workflowId: workflow.id,
        });
      }

      // High execution time alert
      if (metrics.averageExecutionTime > 5000) {
        // 5 seconds
        alerts.push({
          type: 'execution_time',
          severity: metrics.averageExecutionTime > 10000 ? 'high' : 'medium',
          message: `Workflow "${workflow.name}" has slow execution time: ${metrics.averageExecutionTime}ms`,
          value: metrics.averageExecutionTime,
          threshold: 5000,
          workflowId: workflow.id,
        });
      }
    }

    // Check automation rule performance
    const rules = await this.ruleRepo.find({
      where: { projectId },
    });

    for (const rule of rules) {
      const metrics = await this.getAutomationRuleMetrics(rule.id);

      // High failure rate alert
      if (metrics.errorRate > 30) {
        alerts.push({
          type: 'failure_rate',
          severity: metrics.errorRate > 60 ? 'high' : 'medium',
          message: `Automation rule "${rule.name}" has high failure rate: ${metrics.errorRate}%`,
          value: metrics.errorRate,
          threshold: 30,
          ruleId: rule.id,
        });
      }
    }

    return alerts;
  }

  async generatePerformanceReport(
    projectId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    summary: {
      totalExecutions: number;
      successRate: number;
      averageExecutionTime: number;
      totalErrors: number;
    };
    workflows: WorkflowPerformanceMetrics[];
    rules: AutomationRuleMetrics[];
    trends: Array<{
      date: string;
      executions: number;
      successRate: number;
    }>;
  }> {
    const executions = await this.executionRepo
      .createQueryBuilder('execution')
      .leftJoin('execution.workflow', 'workflow')
      .where('workflow.projectId = :projectId', { projectId })
      .andWhere('execution.startedAt >= :startDate', { startDate })
      .andWhere('execution.startedAt <= :endDate', { endDate })
      .getMany();

    const workflows = await this.workflowRepo.find({
      where: { projectId },
    });

    const rules = await this.ruleRepo.find({
      where: { projectId },
    });

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(
      (e) => e.status === ExecutionStatus.COMPLETED,
    ).length;
    const successRate =
      totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
    const totalErrors = executions.filter(
      (e) => e.status === ExecutionStatus.FAILED,
    ).length;

    const executionTimes = executions
      .filter((e) => e.executionTime !== undefined)
      .map((e) => e.executionTime!);
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((sum, time) => sum + (time || 0), 0) /
          executionTimes.length
        : 0;

    const workflowMetrics = await Promise.all(
      workflows.map((w) => this.getWorkflowPerformanceMetrics(w.id)),
    );

    const ruleMetrics = await Promise.all(
      rules.map((r) => this.getAutomationRuleMetrics(r.id)),
    );

    // Generate daily trends
    const trends: Array<{
      date: string;
      executions: number;
      successRate: number;
    }> = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
      );
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayExecutions = executions.filter(
        (e) => e.startedAt >= dayStart && e.startedAt < dayEnd,
      );

      const daySuccessRate =
        dayExecutions.length > 0
          ? (dayExecutions.filter((e) => e.status === ExecutionStatus.COMPLETED)
              .length /
              dayExecutions.length) *
            100
          : 0;

      trends.push({
        date: dayStart.toISOString().split('T')[0],
        executions: dayExecutions.length,
        successRate: parseFloat(daySuccessRate.toFixed(2)),
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      summary: {
        totalExecutions,
        successRate: parseFloat(successRate.toFixed(2)),
        averageExecutionTime: parseFloat(averageExecutionTime.toFixed(2)),
        totalErrors,
      },
      workflows: workflowMetrics,
      rules: ruleMetrics,
      trends,
    };
  }
}
