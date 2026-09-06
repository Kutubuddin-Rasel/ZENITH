import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProjectMetrics,
  type MetricType,
} from '../../entities/project-metrics.entity';
import {
  TENANT_CONTEXT_READER_TOKEN,
  type ITenantContextReader,
} from '../../../core/tenant';
import type {
  IProjectMetricsRepository,
  HistoricalMetricPoint,
  PersistMetricInput,
} from '../../interfaces/analytics.interfaces';

/**
 * TypeORM implementation of the pre-aggregated `ProjectMetrics` rollup port.
 *
 * Owns the `@InjectRepository(ProjectMetrics)` coupling that previously lived
 * inside `HistoricalMetricsService`, so both the tenant-isolated time-series
 * read and the idempotent cron upsert flow through one swappable seam — the
 * prime ClickHouse migration candidate.
 */
@Injectable()
export class TypeormProjectMetricsRepository implements IProjectMetricsRepository {
  private readonly logger = new Logger(TypeormProjectMetricsRepository.name);

  constructor(
    @InjectRepository(ProjectMetrics)
    private readonly metricsRepo: Repository<ProjectMetrics>,
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly tenantContext: ITenantContextReader,
  ) {}

  /**
   * Query historical metrics for a project within a date range.
   *
   * SECURITY: Tenant-isolated via mandatory organizationId filter from
   * TenantContext (CLS-injected from JWT). Query Builder applies tenantId as
   * the FIRST WHERE clause — matching the compound index leading column.
   *
   * PERFORMANCE: Uses the compound index
   * (organizationId, projectId, metricType, calculatedAt) for sub-50ms scans.
   */
  async findHistorical(
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
   * IDEMPOTENCY: the unique constraint
   * (organizationId, projectId, metricType, metricDate) collapses BullMQ
   * retries and multi-pod duplicate cron runs into a harmless UPDATE.
   *
   * CRON CONTEXT: called outside CLS/request context, so organizationId is
   * supplied explicitly on `input` (never read from TenantContext here).
   */
  async upsertSnapshot(input: PersistMetricInput): Promise<void> {
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
