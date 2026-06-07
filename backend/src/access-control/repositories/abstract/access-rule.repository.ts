import type { FindManyOptions, FindOptionsWhere } from 'typeorm';
import type { IPAccessRule } from '../../entities/ip-access-rule.entity';
import type { AccessRuleHistoryRepository } from './access-rule-history.repository';

/**
 * Transactional unit-of-work handed to `runInTransaction`. Exposes both
 * repositories bound to the SAME TypeORM manager so a rule write and its
 * history record commit atomically (preserves the legacy queryRunner flow).
 */
export interface AccessRuleTxContext {
  rules: AccessRuleRepository;
  history: AccessRuleHistoryRepository;
}

export abstract class AccessRuleRepository {
  abstract findActiveForTenant(
    organizationId: string | null,
    now: Date,
  ): Promise<IPAccessRule[]>;
  abstract findById(id: string): Promise<IPAccessRule | null>;
  abstract findMany(
    where: FindOptionsWhere<IPAccessRule> | FindOptionsWhere<IPAccessRule>[],
    options?: FindManyOptions<IPAccessRule>,
  ): Promise<IPAccessRule[]>;
  abstract findAll(
    options?: FindManyOptions<IPAccessRule>,
  ): Promise<IPAccessRule[]>;
  abstract findEmergencyRules(
    organizationId: string | null,
  ): Promise<IPAccessRule[]>;
  abstract create(data: Partial<IPAccessRule>): IPAccessRule;
  abstract save(
    rule: IPAccessRule | Partial<IPAccessRule>,
  ): Promise<IPAccessRule>;
  abstract update(id: string, patch: Partial<IPAccessRule>): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract incrementHitCount(id: string): Promise<void>;
  abstract findExpiredBefore(cutoff: Date): Promise<IPAccessRule[]>;
  abstract runInTransaction<T>(
    work: (tx: AccessRuleTxContext) => Promise<T>,
  ): Promise<T>;
}
