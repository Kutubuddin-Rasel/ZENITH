import { Injectable } from '@nestjs/common';
import {
  AccessRuleStatus,
  AccessRuleType,
} from '../entities/ip-access-rule.entity';
import {
  IAccessRuleCache,
  IAccessRuleQuery,
  IAccessStats,
} from '../interfaces/access-control.interfaces';

@Injectable()
export class AccessStatsService extends IAccessStats {
  constructor(
    private readonly query: IAccessRuleQuery,
    private readonly cache: IAccessRuleCache,
  ) {
    super();
  }

  async getAccessStats(
    organizationId?: string,
  ): Promise<Record<string, unknown>> {
    const rules = await this.query.findAll(
      organizationId ? { organizationId } : undefined,
    );
    const activeRules = rules.filter(
      (r) => r.status === AccessRuleStatus.ACTIVE && r.isActive,
    );

    return {
      totalRules: rules.length,
      activeRules: activeRules.length,
      whitelistRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.WHITELIST,
      ).length,
      blacklistRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.BLACKLIST,
      ).length,
      geographicRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.GEOGRAPHIC,
      ).length,
      timeBasedRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.TIME_BASED,
      ).length,
      globalRules: rules.filter((r) => r.organizationId === null).length,
      orgRules: rules.filter((r) => r.organizationId !== null).length,
      totalHits: rules.reduce((sum, r) => sum + r.hitCount, 0),
      topRules: rules
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 10)
        .map((r) => ({ ruleId: r.id, name: r.name, hitCount: r.hitCount })),
      cache: this.cache.getStats(),
    };
  }
}
