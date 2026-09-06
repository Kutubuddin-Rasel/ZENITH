import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TENANT_CONTEXT_READER_TOKEN,
  type ITenantContextReader,
} from '../../../core/tenant';
import { tenantJoin } from '../../../database/helpers/safe-query.helper';
import type {
  IAnalyticsReadModel,
  CycleTimeIssueRow,
  StalledIssue,
} from '../../interfaces/analytics.interfaces';

/**
 * Postgres implementation of the analytics OLTP read port.
 *
 * This class is the SOLE owner of raw SQL against the live `issues` /
 * `projects` tables for the analytics module. It deliberately concentrates
 * every Postgres-dialect construct — `tenantJoin()`, `INTERVAL` arithmetic,
 * `EXTRACT(...)`, the soft-delete structural filter — so that the calculator,
 * query, and cron services upstream stay 100% dialect-free. Swapping in a
 * `ClickHouseAnalyticsReadRepository` (the planned OLAP migration) requires
 * NO changes outside this file.
 *
 * SECURITY: request-scoped reads (`findDoneIssuesForCycleTime`,
 * `findDoneIssuesInPeriod`, `findStalledIssues`) enforce tenant isolation via
 * `tenantJoin()` (org id resolved from CLS). The cron-scoped read
 * (`findStalledIssuesSystemWide`) runs OUTSIDE request context and instead
 * relies on the structural `projects."deletedAt" IS NULL` filter — exactly
 * the contract documented on `IAnalyticsReadModel`.
 */
@Injectable()
export class PostgresAnalyticsReadRepository implements IAnalyticsReadModel {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(TENANT_CONTEXT_READER_TOKEN)
    private readonly tenantContext: ITenantContextReader,
  ) {}

  async findDoneIssuesForCycleTime(
    projectId: string,
    lookbackDays: number,
  ): Promise<CycleTimeIssueRow[]> {
    // @RAW_QUERY_AUDIT: Tenant isolation via tenantJoin() (request-scoped CLS).
    // Lookback window is a BOUND parameter ($2) — no string interpolation.
    return this.dataSource.query(
      `
      SELECT i.id, i.title, i.status, i."updatedAt"
      FROM issues i
      ${tenantJoin('issues', 'i', this.tenantContext)}
      WHERE i."projectId" = $1
      AND i.status = 'Done'
      AND i."updatedAt" > NOW() - (INTERVAL '1 day' * $2::int)
      `,
      [projectId, lookbackDays],
    );
  }

  async findDoneIssuesInPeriod(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<CycleTimeIssueRow[]> {
    // @RAW_QUERY_AUDIT: Tenant isolation enforced via tenantJoin().
    return this.dataSource.query(
      `
      SELECT i.id, i.title, i.status, i."updatedAt"
      FROM issues i
      ${tenantJoin('issues', 'i', this.tenantContext)}
      WHERE i."projectId" = $1
      AND i.status = 'Done'
      AND i."updatedAt" > $2
      AND i."updatedAt" <= $3
      `,
      [projectId, start, end],
    );
  }

  async findStalledIssues(
    projectId: string,
    stalledAfterDays: number,
  ): Promise<StalledIssue[]> {
    // @RAW_QUERY_AUDIT: Tenant isolation enforced via tenantJoin() (request-scoped).
    // The second `projects p` join resolves the human-readable project key.
    return this.dataSource.query(
      `
      SELECT
        i.id,
        i.title,
        i."assigneeId",
        i."projectId",
        p."key" as "projectKey",
        EXTRACT(DAY FROM NOW() - i."updatedAt") as "daysSinceUpdate"
      FROM issues i
      ${tenantJoin('issues', 'i', this.tenantContext)}
      JOIN projects p ON i."projectId" = p.id
      WHERE i."projectId" = $1
      AND i.status NOT IN ('Done', 'Archived')
      AND i."updatedAt" < NOW() - (INTERVAL '1 day' * $2::int)
      ORDER BY i."updatedAt" ASC
      `,
      [projectId, stalledAfterDays],
    );
  }

  async findStalledIssuesSystemWide(
    stalledAfterDays: number,
    limit: number,
  ): Promise<StalledIssue[]> {
    // @RAW_QUERY_AUDIT: Runs OUTSIDE request context (cron) — no CLS tenant id.
    // Tenant safety via structural JOIN + soft-delete filter on projects.
    return this.dataSource.query(
      `
      SELECT
        i.id,
        i.title,
        i."assigneeId",
        i."projectId",
        p."key" as "projectKey",
        EXTRACT(DAY FROM NOW() - i."updatedAt") as "daysSinceUpdate"
      FROM issues i
      INNER JOIN projects p
        ON p.id = i."projectId"
        AND p."deletedAt" IS NULL
      WHERE i.status NOT IN ('Done', 'Archived')
      AND i."updatedAt" < NOW() - (INTERVAL '1 day' * $1::int)
      AND i."deletedAt" IS NULL
      ORDER BY i."updatedAt" ASC
      LIMIT $2::int
      `,
      [stalledAfterDays, limit],
    );
  }

  async findProjectOrganizationId(projectId: string): Promise<string | null> {
    const rows: Array<{ organizationId: string }> = await this.dataSource.query(
      'SELECT "organizationId" FROM projects WHERE id = $1 LIMIT 1',
      [projectId],
    );
    return rows[0]?.organizationId ?? null;
  }
}
