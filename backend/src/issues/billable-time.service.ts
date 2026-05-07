import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkLog } from './entities/work-log.entity';
import { BillingSummary } from './dto/timer.interface';

interface BillableScope {
  issueId?: string;
  projectId?: string;
  currency?: string;
}

interface RawBillableRow {
  totalMinutes: string | number | null;
  billableMinutes: string | number | null;
  amountCents: string | number | null;
}

@Injectable()
export class BillableTimeService {
  constructor(
    @InjectRepository(WorkLog)
    private readonly workLogRepo: Repository<WorkLog>,
  ) {}

  async calculateBillableAmount(scope: BillableScope): Promise<BillingSummary> {
    if (!scope.issueId && !scope.projectId) {
      return this.empty(scope.currency);
    }
    const qb = this.workLogRepo
      .createQueryBuilder('wl')
      .select('COALESCE(SUM(wl.minutesSpent), 0)', 'totalMinutes')
      .addSelect(
        'COALESCE(SUM(CASE WHEN wl.billable = true THEN wl.minutesSpent ELSE 0 END), 0)',
        'billableMinutes',
      )
      .addSelect(
        // Currency-safe: integer cents computed in NUMERIC at the DB layer.
        'COALESCE(ROUND(SUM(CASE WHEN wl.billable = true AND wl.hourlyRate IS NOT NULL THEN wl.minutesSpent * wl.hourlyRate ELSE 0 END) * 100.0 / 60), 0)',
        'amountCents',
      );
    if (scope.issueId) {
      qb.where('wl.issueId = :issueId', { issueId: scope.issueId });
    } else if (scope.projectId) {
      qb.where('wl.projectId = :projectId', { projectId: scope.projectId });
    }
    const raw = await qb.getRawOne<RawBillableRow>();
    return this.toSummary(raw, scope.currency);
  }

  private toSummary(
    raw: RawBillableRow | undefined,
    currency?: string,
  ): BillingSummary {
    const totalMinutes = this.num(raw?.totalMinutes);
    const billableMinutes = this.num(raw?.billableMinutes);
    const amountCents = this.num(raw?.amountCents);
    const cur = currency ?? 'USD';
    return {
      totalMinutes,
      billableMinutes,
      amountCents,
      formattedAmount: this.formatCents(amountCents, cur),
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

  private num(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const n = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(n) ? n : 0;
  }

  private formatCents(cents: number, currency: string): string {
    const whole = Math.floor(cents / 100);
    const remainder = Math.abs(cents % 100)
      .toString()
      .padStart(2, '0');
    return `${currency} ${whole}.${remainder}`;
  }
}
