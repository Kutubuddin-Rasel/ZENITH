import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AutomationRule,
  TriggerDefinition,
  ConditionDefinition,
  ActionDefinition,
  AutomationRuleStatus,
} from '../entities/automation-rule.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AutomationRulesService {
  private readonly logger = new Logger(AutomationRulesService.name);

  constructor(
    @InjectRepository(AutomationRule)
    private ruleRepo: Repository<AutomationRule>,
  ) {}

  async createRule(
    projectId: string,
    userId: string,
    ruleData: {
      name: string;
      description?: string;
      triggerType: string;
      triggerConfig: TriggerDefinition;
      conditions?: ConditionDefinition[];
      actions: ActionDefinition[];
      tags?: string[];
      category?: string;
    },
  ): Promise<AutomationRule> {
    const rule = this.ruleRepo.create({
      projectId,
      createdBy: userId,
      ...ruleData,
      status: AutomationRuleStatus.ACTIVE,
    });

    return this.ruleRepo.save(rule);
  }

  async updateRule(
    ruleId: string,
    userId: string,
    updates: Partial<{
      name: string;
      description: string;
      triggerConfig: TriggerDefinition;
      conditions: ConditionDefinition[];
      actions: ActionDefinition[];
      isActive: boolean;
      tags: string[];
      category: string;
    }>,
  ): Promise<AutomationRule> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, createdBy: userId },
    });

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    Object.assign(rule, updates);
    return this.ruleRepo.save(rule);
  }

  async getRules(
    projectId: string,
    filters?: {
      isActive?: boolean;
      triggerType?: string;
      category?: string;
      search?: string;
    },
  ): Promise<AutomationRule[]> {
    const query = this.ruleRepo
      .createQueryBuilder('rule')
      .where('rule.projectId = :projectId', { projectId });

    if (filters?.isActive !== undefined) {
      query.andWhere('rule.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    if (filters?.triggerType) {
      query.andWhere('rule.triggerType = :triggerType', {
        triggerType: filters.triggerType,
      });
    }

    if (filters?.category) {
      query.andWhere('rule.category = :category', {
        category: filters.category,
      });
    }

    if (filters?.search) {
      query.andWhere(
        '(rule.name ILIKE :search OR rule.description ILIKE :search)',
        {
          search: `%${filters.search}%`,
        },
      );
    }

    return query.orderBy('rule.createdAt', 'DESC').getMany();
  }

  async getRuleById(ruleId: string): Promise<AutomationRule> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    return rule;
  }

  async deleteRule(ruleId: string, userId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, createdBy: userId },
    });

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    await this.ruleRepo.remove(rule);
  }

  async toggleRule(ruleId: string, userId: string): Promise<AutomationRule> {
    const rule = await this.ruleRepo.findOne({
      where: { id: ruleId, createdBy: userId },
    });

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    rule.isActive = !rule.isActive;
    return this.ruleRepo.save(rule);
  }

  async executeRule(
    ruleId: string,
    context: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const rule = await this.getRuleById(ruleId);

    if (!rule.isActive) {
      return { success: false, error: 'Rule is inactive' };
    }

    try {
      // Check if trigger conditions are met
      if (!this.evaluateTrigger(rule.triggerConfig, context)) {
        return { success: false, error: 'Trigger conditions not met' };
      }

      // Evaluate conditions
      if (
        rule.conditions &&
        !this.evaluateConditions(rule.conditions, context)
      ) {
        return { success: false, error: 'Rule conditions not met' };
      }

      // Execute actions
      const result = await this.executeActions(rule.actions, context);

      // Update rule statistics
      await this.updateRuleStats(ruleId, true);

      return { success: true, result };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Rule execution failed: ${errorMessage}`, errorStack);

      // Update rule statistics
      await this.updateRuleStats(ruleId, false, errorMessage);

      return { success: false, error: errorMessage };
    }
  }

  private evaluateTrigger(
    trigger: TriggerDefinition,
    context: Record<string, unknown>,
  ): boolean {
    switch (trigger.type) {
      case 'field_change':
        return this.evaluateFieldChangeTrigger(trigger.config, context);
      case 'time_based':
        return this.evaluateTimeBasedTrigger(trigger.config, context);
      case 'user_action':
        return this.evaluateUserActionTrigger(trigger.config, context);
      case 'external_event':
        return this.evaluateExternalEventTrigger(trigger.config, context);
      case 'scheduled':
        return this.evaluateScheduledTrigger(trigger.config, context);
      default:
        return false;
    }
  }

  private evaluateFieldChangeTrigger(
    config: TriggerDefinition['config'],
    context: Record<string, unknown>,
  ): boolean {
    const { field, operator, value } = config as {
      field: string;
      operator: string;
      value: unknown;
    };
    const fieldValue = this.getNestedValue(context, field || '');

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return String(fieldValue).includes(String(value));
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      default:
        return false;
    }
  }

  private evaluateTimeBasedTrigger(
    config: TriggerDefinition['config'],
    context: Record<string, unknown>,
  ): boolean {
    const { field, operator } = config as {
      field: string;
      operator: string;
    };
    const fieldValue = new Date(
      this.getNestedValue(context, field || '') as string | number | Date,
    );
    const now = new Date();

    switch (operator) {
      case 'equals':
        return Math.abs(fieldValue.getTime() - now.getTime()) < 60000; // 1 minute tolerance
      case 'greater_than':
        return fieldValue > now;
      case 'less_than':
        return fieldValue < now;
      default:
        return false;
    }
  }

  private evaluateUserActionTrigger(
    config: TriggerDefinition['config'],
    context: Record<string, unknown>,
  ): boolean {
    const { eventType } = config as { eventType: string };
    return (context.eventType as string) === eventType;
  }

  private evaluateExternalEventTrigger(
    config: TriggerDefinition['config'],
    context: Record<string, unknown>,
  ): boolean {
    const { webhookUrl, eventType } = config as {
      webhookUrl: string;
      eventType: string;
    };
    return (
      (context.webhookUrl as string) === webhookUrl &&
      (context.eventType as string) === eventType
    );
  }

  private evaluateScheduledTrigger(
    _config: TriggerDefinition['config'],

    _context: Record<string, unknown>,
  ): boolean {
    // This would be handled by the cron scheduler
    return true;
  }

  private evaluateConditions(
    conditions: ConditionDefinition[],
    context: Record<string, unknown>,
  ): boolean {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    let result = this.evaluateCondition(conditions[0], context);

    for (let i = 1; i < conditions.length; i++) {
      const condition = conditions[i];
      const conditionResult = this.evaluateCondition(condition, context);

      if (condition.logicalOperator === 'AND') {
        result = result && conditionResult;
      } else if (condition.logicalOperator === 'OR') {
        result = result || conditionResult;
      } else {
        result = result && conditionResult; // Default to AND
      }
    }

    return result;
  }

  private evaluateCondition(
    condition: ConditionDefinition,
    context: Record<string, unknown>,
  ): boolean {
    const fieldValue = this.getNestedValue(context, condition.field);

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return String(fieldValue).includes(String(condition.value));
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'is_empty':
        return !fieldValue || fieldValue === '';
      case 'is_not_empty':
        return Boolean(fieldValue) && fieldValue !== '';
      default:
        return false;
    }
  }

  private async executeActions(
    actions: ActionDefinition[],
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    // Sort actions by order
    const sortedActions = actions.sort((a, b) => a.order - b.order);

    for (const action of sortedActions) {
      try {
        const result = await this.executeAction(action, context);
        results[action.id] = result;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Action execution failed: ${action.id}`, error);
        results[action.id] = { error: errorMessage };
      }
    }

    return results;
  }

  private async executeAction(
    action: ActionDefinition,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (action.type) {
      case 'update_field':
        return this.executeUpdateFieldAction(action, context);
      case 'send_notification':
        return this.executeSendNotificationAction(action, context);
      case 'assign_user':
        return this.executeAssignUserAction(action, context);
      case 'create_issue':
        return this.executeCreateIssueAction(action, context);
      case 'update_status':
        return this.executeUpdateStatusAction(action, context);
      case 'send_email':
        return this.executeSendEmailAction(action, context);
      case 'webhook_call':
        return this.executeWebhookCallAction(action, context);
      case 'delay':
        return this.executeDelayAction(action, context);
      default: {
        const actionType: string = action.type || 'unknown';
        throw new Error(`Unknown action type: ${actionType}`);
      }
    }
  }

  private executeUpdateFieldAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { field, value } = action.config as {
      field?: string;
      value?: unknown;
    };
    // In a real implementation, this would update the actual field in the database
    return Promise.resolve({ field, value, updated: true });
  }

  private executeSendNotificationAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { template, userId } = action.config as {
      template?: string;
      userId?: string;
    };
    // In a real implementation, this would send a notification
    return Promise.resolve({ template, userId, sent: true });
  }

  private executeAssignUserAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { userId } = action.config as { userId?: string };
    // In a real implementation, this would assign the user
    return Promise.resolve({ userId, assigned: true });
  }

  private executeCreateIssueAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { title, description, type, priority } = action.config as {
      title?: string;
      description?: string;
      type?: string;
      priority?: string;
    };
    // In a real implementation, this would create an issue
    return Promise.resolve({
      title,
      description,
      type,
      priority,
      created: true,
    });
  }

  private executeUpdateStatusAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { status } = action.config as { status?: string };
    // In a real implementation, this would update the status
    return Promise.resolve({ status, updated: true });
  }

  private executeSendEmailAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { template, to, subject } = action.config as {
      template?: string;
      to?: string;
      subject?: string;
    };
    // In a real implementation, this would send an email
    return Promise.resolve({ template, to, subject, sent: true });
  }

  private executeWebhookCallAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { url, method, headers, body } = action.config as {
      url?: string;
      method?: string;
      headers?: Record<string, unknown>;
      body?: unknown;
    };
    // In a real implementation, this would make a webhook call
    return Promise.resolve({ url, method, headers, body, called: true });
  }

  private async executeDelayAction(
    action: ActionDefinition,

    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { delay } = action.config as { delay?: number };
    await new Promise((resolve) => setTimeout(resolve, (delay || 0) * 1000));
    return { delay, completed: true };
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj as unknown);
  }

  private async updateRuleStats(
    ruleId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const rule = await this.getRuleById(ruleId);

    const newExecutionCount = rule.executionCount + 1;
    const newSuccessCount = success
      ? (rule.executionCount * (rule.successRate || 0)) / 100 + 1
      : (rule.executionCount * (rule.successRate || 0)) / 100;
    const newSuccessRate = (newSuccessCount / newExecutionCount) * 100;

    await this.ruleRepo.update(ruleId, {
      executionCount: newExecutionCount,
      successRate: parseFloat(newSuccessRate.toFixed(2)),
      lastExecutedAt: new Date(),
      lastError: error || undefined,
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledRules(): Promise<void> {
    const scheduledRules = await this.ruleRepo.find({
      where: {
        triggerType: 'scheduled',
        isActive: true,
        status: AutomationRuleStatus.ACTIVE,
      },
    });

    for (const rule of scheduledRules) {
      try {
        await this.executeRule(rule.id, {});
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Scheduled rule execution failed: ${rule.id}`,
          errorMessage,
        );
      }
    }
  }

  async testRule(
    ruleId: string,
    testContext: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    // Verify rule exists
    await this.getRuleById(ruleId);

    // Temporarily set rule to testing status
    await this.ruleRepo.update(ruleId, {
      status: AutomationRuleStatus.TESTING,
    });

    try {
      const result = await this.executeRule(ruleId, testContext);

      // Reset rule status
      await this.ruleRepo.update(ruleId, {
        status: AutomationRuleStatus.ACTIVE,
      });

      return result;
    } catch (error: unknown) {
      // Reset rule status
      await this.ruleRepo.update(ruleId, {
        status: AutomationRuleStatus.ACTIVE,
      });

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  async getRuleAnalytics(ruleId: string): Promise<{
    executionCount: number;
    successRate: number;
    averageExecutionTime: number;
    lastExecutedAt: Date;
    errorRate: number;
  }> {
    const rule = await this.getRuleById(ruleId);

    return {
      executionCount: rule.executionCount,
      successRate: rule.successRate || 0,
      averageExecutionTime: rule.averageExecutionTime || 0,
      lastExecutedAt: rule.lastExecutedAt || rule.createdAt,
      errorRate: 100 - (rule.successRate || 0),
    };
  }
}
