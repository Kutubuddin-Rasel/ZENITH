import { Injectable } from '@nestjs/common';
import { FindOptionsWhere } from 'typeorm';
import {
  IPAccessRule,
  AccessRuleType,
  AccessRuleStatus,
} from '../entities/ip-access-rule.entity';
import { AccessRuleRepository } from '../repositories/abstract/access-rule.repository';
import {
  IAccessRuleCache,
  IAccessRuleQuery,
} from '../interfaces/access-control.interfaces';

@Injectable()
export class AccessRuleQueryService extends IAccessRuleQuery {
  constructor(
    private readonly cache: IAccessRuleCache,
    private readonly accessRuleRepo: AccessRuleRepository,
  ) {
    super();
  }

  findActive(organizationId?: string): Promise<IPAccessRule[]> {
    return this.cache.getMergedRules(organizationId);
  }

  findAll(filters?: {
    type?: AccessRuleType;
    status?: AccessRuleStatus;
    organizationId?: string;
  }): Promise<IPAccessRule[]> {
    if (
      !filters ||
      (!filters.type && !filters.status && !filters.organizationId)
    ) {
      // Preserves legacy getAllRules() → getGlobalRules() (active global).
      return this.cache.getMergedRules(undefined);
    }

    const where: FindOptionsWhere<IPAccessRule> = {};
    if (filters.type) where.ruleType = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.organizationId) where.organizationId = filters.organizationId;

    return this.accessRuleRepo.findMany(where, {
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  findById(id: string): Promise<IPAccessRule | null> {
    return this.accessRuleRepo.findById(id);
  }
}
