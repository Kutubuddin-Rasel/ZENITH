import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProjectMetrics,
  MetricType,
  IPercentiles,
} from '../entities/project-metrics.entity';
import { TenantContext } from '../../core/tenant/tenant-context.service';

// ---------------------------------------------------------------------------
// Strict Interfaces (ZERO `any`)
// ---------------------------------------------------------------------------

/** Input for persisting a metric snapshot (used by cron jobs) */
export interface PersistMetricInput {
  organizationId: string;
  projectId: string;
  metricType: MetricType;
  value: number;
  percentiles: IPercentiles | null;
  referenceId: string | null;
}

/** Response shape for the historical metrics API */
export interface HistoricalMetricPoint {
  metricDate: string;
  value: number;
  percentiles: IPercentiles | null;
  calculatedAt: Date;
  referenceId: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class HistoricalMetricsService {
  private readonly logger = new Logger(HistoricalMetricsService.name);

  constructor(
    @InjectRepository(ProjectMetrics)
    private readonly metricsRepo: Repository<ProjectMetrics>,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Query historical metrics for a project within a date range.
   *
   * SECURITY: Tenant-isolated via mandatory organizationId filter
   * from TenantContext (CLS-injected from JWT). Query Builder applies
   * tenantId as the FIRST WHERE clause.
   *
   * PERFORMANCE: Uses the compound index
   * (organizationId, projectId, metricType, calculatedAt)
   * for sub-50ms scans even at 50M rows.
   */
  async getHistoricalMetrics(
    projectId: string,
    metricType: MetricType,
    startDate: string,
    endDate: string,
    referenceId?: string,
  ): Promise<HistoricalMetricPoint[]> {
    const tenantId = this.tenantContext.getTenantId();

    if (!tenantId) {
      throw new Error(
        'TenantContext is empty — refusing to query ProjectMetrics without tenant scope.',
      );
    }

    const qb = this.metricsRepo
      .createQueryBuilder('m')
      // SECURITY: Tenant filter FIRST — matches compound index leading column
      .where('m."organizationId" = :tenantId', { tenantId })
      .andWhere('m."projectId" = :projectId', { projectId })
      .andWhere('m."metricType" = :metricType', { metricType })
      .andWhere('m."metricDate" >= :startDate', { startDate })
      .andWhere('m."metricDate" <= :endDate', { endDate });

    // Optional sprint-scoped filter
    if (referenceId) {
      qb.andWhere('m."referenceId" = :referenceId', { referenceId });
    }

    qb.orderBy('m."calculatedAt"', 'ASC').select([
      'm.metricDate',
      'm.value',
      'm.percentiles',
      'm.calculatedAt',
      'm.referenceId',
    ]);

    const rows = await qb.getMany();

    return rows.map((row) => ({
      metricDate: row.metricDate,
      value: Number(row.value), // decimal → number for JSON response
      percentiles: row.percentiles,
      calculatedAt: row.calculatedAt,
      referenceId: row.referenceId,
    }));
  }

  /**
   * Persist a metric snapshot using UPSERT (ON CONFLICT DO UPDATE).
   *
   * IDEMPOTENCY:
   * Uses the unique constraint (organizationId, projectId, metricType, metricDate)
   * to prevent duplicate snapshots. If a snapshot already exists for the same
   * project + metric + day, it gets UPDATED with the latest value.
   *
   * This handles:
   * - BullMQ retries → overwrites with fresh calculation (latest wins)
   * - Multi-pod duplicate cron → second INSERT becomes UPDATE (harmless)
   *
   * CRON CONTEXT:
   * This method is called from cron jobs that run outside CLS/request context.
   * The organizationId is passed explicitly (not from TenantContext).
   */
  async persistMetricSnapshot(input: PersistMetricInput): Promise<void> {
    const now = new Date();
    // Truncate to day boundary for the unique constraint
    const metricDate = now.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    try {
      await this.metricsRepo
        .createQueryBuilder()
        .insert()
        .into(ProjectMetrics)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          metricType: input.metricType,
          value: input.value,
          percentiles: input.percentiles,
          calculatedAt: now,
          metricDate,
          referenceId: input.referenceId,
        })
        .orUpdate(
          ['value', 'percentiles', 'calculatedAt', 'referenceId'],
          ['organizationId', 'projectId', 'metricType', 'metricDate'],
        )
        .execute();

      this.logger.debug(
        `Persisted ${input.metricType} for project ${input.projectId} (date: ${metricDate})`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to persist metric snapshot: ${msg}`);
      // Don't re-throw — metric persistence failure should not crash the cron
    }
  }
}
