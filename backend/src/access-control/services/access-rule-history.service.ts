import { Injectable } from '@nestjs/common';
import { AccessRuleHistory } from '../entities/access-rule-history.entity';
import { HistoryAction } from '../entities/access-rule-history.entity';
import { IPAccessRule } from '../entities/ip-access-rule.entity';
import { AccessRuleHistoryRepository } from '../repositories/abstract/access-rule-history.repository';
import {
  BuildHistoryEntryParams,
  IAccessRuleHistory,
} from '../interfaces/access-control.interfaces';

@Injectable()
export class AccessRuleHistoryService extends IAccessRuleHistory {
  constructor(private readonly historyRepo: AccessRuleHistoryRepository) {
    super();
  }

  buildEntry(params: BuildHistoryEntryParams): Partial<AccessRuleHistory> {
    const { action, rule, before, changedFields, ctx, fallbackActorId } =
      params;
    return {
      action,
      ruleId: rule.id,
      organizationId: rule.organizationId,
      actorId: ctx?.actorId || fallbackActorId || null,
      previousState: before ? this.ruleToSnapshot(before) : null,
      newState:
        action === HistoryAction.DELETE ? null : this.ruleToSnapshot(rule),
      changedFields:
        changedFields && changedFields.length > 0 ? changedFields : null,
      reason: ctx?.reason || null,
      actorIpAddress: ctx?.actorIpAddress || null,
      actorUserAgent: ctx?.actorUserAgent || null,
    };
  }

  getRuleHistory(ruleId: string, limit = 100): Promise<AccessRuleHistory[]> {
    return this.historyRepo.findByRuleId(ruleId, limit);
  }

  getOrganizationHistory(
    organizationId: string,
    limit = 100,
  ): Promise<AccessRuleHistory[]> {
    return this.historyRepo.findByOrganizationId(organizationId, limit);
  }

  /** Convert rule entity to JSON snapshot for history storage. */
  private ruleToSnapshot(rule: IPAccessRule): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    const excludeKeys = ['user', 'creator'];
    for (const [key, value] of Object.entries(rule)) {
      if (!excludeKeys.includes(key)) {
        snapshot[key] = value;
      }
    }
    return snapshot;
  }
}
