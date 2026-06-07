import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  FindManyOptions,
  FindOptionsWhere,
  IsNull,
  LessThan,
  Repository,
} from 'typeorm';
import {
  IPAccessRule,
  AccessRuleStatus,
  AccessRuleType,
} from '../../entities/ip-access-rule.entity';
import { AccessRuleHistory } from '../../entities/access-rule-history.entity';
import {
  AccessRuleRepository,
  AccessRuleTxContext,
} from '../abstract/access-rule.repository';
import { PostgresAccessRuleHistoryRepository } from './postgres-access-rule-history.repository';

@Injectable()
export class PostgresAccessRuleRepository extends AccessRuleRepository {
  constructor(
    @InjectRepository(IPAccessRule)
    private readonly repo: Repository<IPAccessRule>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findActiveForTenant(
    organizationId: string | null,
    now: Date,
  ): Promise<IPAccessRule[]> {
    const where: FindOptionsWhere<IPAccessRule> = {
      organizationId: organizationId === null ? IsNull() : organizationId,
      status: AccessRuleStatus.ACTIVE,
      isActive: true,
    };
    const rules = await this.repo.find({ where, order: { priority: 'DESC' } });
    return rules.filter((rule) => {
      if (rule.validFrom && rule.validFrom > now) return false;
      if (rule.validUntil && rule.validUntil < now) return false;
      return true;
    });
  }

  findById(id: string): Promise<IPAccessRule | null> {
    return this.repo.findOne({ where: { id } });
  }

  findMany(
    where: FindOptionsWhere<IPAccessRule> | FindOptionsWhere<IPAccessRule>[],
    options?: FindManyOptions<IPAccessRule>,
  ): Promise<IPAccessRule[]> {
    return this.repo.find({ where, ...options });
  }

  findAll(options?: FindManyOptions<IPAccessRule>): Promise<IPAccessRule[]> {
    return this.repo.find(options);
  }

  findEmergencyRules(organizationId: string | null): Promise<IPAccessRule[]> {
    const base = {
      ruleType: AccessRuleType.WHITELIST,
      isEmergency: true,
      status: AccessRuleStatus.ACTIVE,
      isActive: true,
    };
    const where:
      | FindOptionsWhere<IPAccessRule>
      | FindOptionsWhere<IPAccessRule>[] = organizationId
      ? [
          { ...base, organizationId: IsNull() },
          { ...base, organizationId },
        ]
      : { ...base, organizationId: IsNull() };
    return this.repo.find({ where });
  }

  create(data: Partial<IPAccessRule>): IPAccessRule {
    return this.repo.create(data);
  }

  save(rule: IPAccessRule | Partial<IPAccessRule>): Promise<IPAccessRule> {
    return this.repo.save(rule as IPAccessRule);
  }

  async update(id: string, patch: Partial<IPAccessRule>): Promise<void> {
    await this.repo.update(
      id,
      patch as Parameters<Repository<IPAccessRule>['update']>[1],
    );
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async incrementHitCount(id: string): Promise<void> {
    await this.repo.increment({ id }, 'hitCount', 1);
    await this.repo.update(id, { lastHitAt: new Date() });
  }

  findExpiredBefore(cutoff: Date): Promise<IPAccessRule[]> {
    return this.repo.find({
      where: {
        status: AccessRuleStatus.ACTIVE,
        expiresAt: LessThan(cutoff),
      },
    });
  }

  runInTransaction<T>(
    work: (tx: AccessRuleTxContext) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const tx: AccessRuleTxContext = {
        rules: new PostgresAccessRuleRepository(
          manager.getRepository(IPAccessRule),
          this.dataSource,
        ),
        history: new PostgresAccessRuleHistoryRepository(
          manager.getRepository(AccessRuleHistory),
        ),
      };
      return work(tx);
    });
  }
}
