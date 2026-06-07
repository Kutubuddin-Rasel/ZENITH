import type { AccessRuleHistory } from '../../entities/access-rule-history.entity';

export abstract class AccessRuleHistoryRepository {
  abstract save(entry: Partial<AccessRuleHistory>): Promise<AccessRuleHistory>;
  abstract findByRuleId(
    ruleId: string,
    limit: number,
  ): Promise<AccessRuleHistory[]>;
  abstract findByOrganizationId(
    organizationId: string,
    limit: number,
  ): Promise<AccessRuleHistory[]>;
}
