import { Injectable } from '@nestjs/common';
import { WorkLogRepository } from '../database/repositories/work-log.repository';
import {
  BillableAggregate,
  BillableScope,
} from '../database/interfaces/repository.interfaces';
import { BillingSummary } from './dto/timer.interface';

interface BillableScopeWithCurrency extends BillableScope {
  currency?: string;
}

@Injectable()
export class BillableTimeService {
  constructor(private readonly workLogs: WorkLogRepository) {}

  async calculateBillableAmount(
    scope: BillableScopeWithCurrency,
  ): Promise<BillingSummary> {
    if (!scope.issueId && !scope.projectId) {
      return this.empty(scope.currency);
    }
    const aggregate = await this.workLogs.aggregateBillable({
      issueId: scope.issueId,
      projectId: scope.projectId,
    });
    return this.toSummary(aggregate, scope.currency);
  }

  private toSummary(
    aggregate: BillableAggregate,
    currency?: string,
  ): BillingSummary {
    const cur = currency ?? 'USD';
    return {
      totalMinutes: aggregate.totalMinutes,
      billableMinutes: aggregate.billableMinutes,
      amountCents: aggregate.amountCents,
      formattedAmount: this.formatCents(aggregate.amountCents, cur),
      currency: cur,
    };
  }

  private empty(currency?: string): BillingSummary {
    const cur = currency ?? 'USD';
    return {
      totalMinutes: 0,
      billableMinutes: 0,
      amountCents: 0,
      formattedAmount: this.formatCents(0, cur),
      currency: cur,
    };
  }

  private formatCents(cents: number, currency: string): string {
    const whole = Math.floor(cents / 100);
    const remainder = Math.abs(cents % 100)
      .toString()
      .padStart(2, '0');
    return `${currency} ${whole}.${remainder}`;
  }
}
