import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IPAccessRule } from '../entities/ip-access-rule.entity';
import { HistoryAction } from '../entities/access-rule-history.entity';
import { AccessRuleRepository } from '../repositories/abstract/access-rule.repository';
import {
  AccessRuleCreateCommand,
  AccessRuleUpdateCommand,
  HistoryContext,
  IAccessRuleAuditor,
  IAccessRuleCommand,
  IAccessRuleHistory,
  TenantScope,
} from '../interfaces/access-control.interfaces';
import {
  ACCESS_CONTROL_EVENTS,
  RulesChangedEvent,
} from '../constants/access-control.events';

@Injectable()
export class AccessRuleCommandService extends IAccessRuleCommand {
  private readonly logger = new Logger(AccessRuleCommandService.name);

  constructor(
    private readonly accessRuleRepo: AccessRuleRepository,
    private readonly history: IAccessRuleHistory,
    private readonly auditor: IAccessRuleAuditor,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async create(
    cmd: AccessRuleCreateCommand,
    scope: TenantScope,
    ctx?: HistoryContext,
  ): Promise<IPAccessRule> {
    const ruleData: Partial<IPAccessRule> = { ...cmd };

    // SECURITY: Enforce organization scoping
    if (!scope.isSuperAdmin) {
      if (!scope.organizationId) {
        throw new Error('Organization context required for non-super-admin');
      }
      ruleData.organizationId = scope.organizationId;
    }

    let savedRule: IPAccessRule;
    try {
      savedRule = await this.accessRuleRepo.runInTransaction(async (tx) => {
        const saved = await tx.rules.save(tx.rules.create(ruleData));
        await tx.history.save(
          this.history.buildEntry({
            action: HistoryAction.CREATE,
            rule: saved,
            ctx,
            fallbackActorId: cmd.createdBy ?? null,
          }),
        );
        return saved;
      });
    } catch (error) {
      this.logger.error('Failed to create rule with history', error);
      throw error;
    }

    this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
      ruleId: savedRule.id,
      organizationId: savedRule.organizationId,
      action: 'created',
    } as RulesChangedEvent);

    void this.auditor.recordRuleChange({
      action: 'created',
      rule: savedRule,
      actorId: ctx?.actorId || cmd.createdBy,
    });

    this.logger.log(
      `Access rule created: ${savedRule.name} (${savedRule.id}) ${savedRule.organizationId ? `for org ${savedRule.organizationId}` : '(global)'}`,
    );
    return savedRule;
  }

  async update(
    id: string,
    cmd: AccessRuleUpdateCommand,
    scope: TenantScope,
    ctx?: HistoryContext,
  ): Promise<IPAccessRule> {
    const updates: Partial<IPAccessRule> = { ...cmd };

    let result: { saved: IPAccessRule; changedFields: string[] };
    try {
      result = await this.accessRuleRepo.runInTransaction(async (tx) => {
        const rule = await tx.rules.findById(id);
        if (!rule) {
          throw new Error('Rule not found');
        }

        // SECURITY: Tenant admin can only update own org rules
        if (!scope.isSuperAdmin) {
          if (rule.organizationId === null) {
            throw new Error(
              'Cannot update global rules without super admin privileges',
            );
          }
          if (rule.organizationId !== scope.organizationId) {
            throw new Error('Cannot update rules from another organization');
          }
          delete updates.organizationId;
        }

        const before: IPAccessRule = { ...rule };
        const changedFields = Object.keys(updates).filter(
          (key) =>
            (rule as unknown as Record<string, unknown>)[key] !==
            (updates as unknown as Record<string, unknown>)[key],
        );

        const saved = await tx.rules.save({ ...rule, ...updates });
        await tx.history.save(
          this.history.buildEntry({
            action: HistoryAction.UPDATE,
            rule: saved,
            before,
            changedFields,
            ctx,
            fallbackActorId: cmd.createdBy ?? null,
          }),
        );
        return { saved, changedFields };
      });
    } catch (error) {
      this.logger.error('Failed to update rule with history', error);
      throw error;
    }

    this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
      ruleId: id,
      organizationId: result.saved.organizationId,
      action: 'updated',
    } as RulesChangedEvent);

    void this.auditor.recordRuleChange({
      action: 'updated',
      rule: result.saved,
      actorId: ctx?.actorId || cmd.createdBy,
      changes: updates,
      changedFields: result.changedFields,
    });

    this.logger.log(`Access rule updated: ${result.saved.name} (${id})`);
    return result.saved;
  }

  async delete(
    id: string,
    actorId: string,
    scope: TenantScope,
    ctx?: HistoryContext,
  ): Promise<void> {
    let deleted: IPAccessRule;
    try {
      deleted = await this.accessRuleRepo.runInTransaction(async (tx) => {
        const rule = await tx.rules.findById(id);
        if (!rule) {
          throw new Error('Rule not found');
        }

        // SECURITY: Tenant admin can only delete own org rules
        if (!scope.isSuperAdmin) {
          if (rule.organizationId === null) {
            throw new Error(
              'Cannot delete global rules without super admin privileges',
            );
          }
          if (rule.organizationId !== scope.organizationId) {
            throw new Error('Cannot delete rules from another organization');
          }
        }

        const before: IPAccessRule = { ...rule };
        await tx.history.save(
          this.history.buildEntry({
            action: HistoryAction.DELETE,
            rule: before,
            before,
            ctx,
            fallbackActorId: actorId ?? null,
          }),
        );
        await tx.rules.delete(id);
        return before;
      });
    } catch (error) {
      this.logger.error('Failed to delete rule with history', error);
      throw error;
    }

    this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
      ruleId: id,
      organizationId: deleted.organizationId,
      action: 'deleted',
    } as RulesChangedEvent);

    void this.auditor.recordRuleChange({
      action: 'deleted',
      rule: deleted,
      actorId: ctx?.actorId || actorId,
    });

    this.logger.log(`Access rule deleted: ${deleted.name} (${id})`);
  }
}
