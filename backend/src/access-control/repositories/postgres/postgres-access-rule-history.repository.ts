import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessRuleHistory } from '../../entities/access-rule-history.entity';
import { AccessRuleHistoryRepository } from '../abstract/access-rule-history.repository';

@Injectable()
export class PostgresAccessRuleHistoryRepository extends AccessRuleHistoryRepository {
  constructor(
    @InjectRepository(AccessRuleHistory)
    private readonly repo: Repository<AccessRuleHistory>,
  ) {
    super();
  }

  save(entry: Partial<AccessRuleHistory>): Promise<AccessRuleHistory> {
    return this.repo.save(this.repo.create(entry));
  }

  findByRuleId(ruleId: string, limit: number): Promise<AccessRuleHistory[]> {
    return this.repo.find({
      where: { ruleId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  findByOrganizationId(
    organizationId: string,
    limit: number,
  ): Promise<AccessRuleHistory[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
