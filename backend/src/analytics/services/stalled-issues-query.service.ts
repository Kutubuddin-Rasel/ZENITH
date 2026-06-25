import { Inject, Injectable } from '@nestjs/common';
import { ANALYTICS_READ_MODEL_TOKEN } from '../constants/analytics.tokens';
import type {
  IAnalyticsReadModel,
  IStalledIssuesQuery,
  StalledIssue,
} from '../interfaces/analytics.interfaces';

/** Issues with no activity beyond this many days are considered stalled. */
const STALL_THRESHOLD_DAYS = 3;

/**
 * Stalled-issues read surface (`IStalledIssuesQuery`) backing
 * `GET /analytics/stalled-issues`.
 *
 * CQRS (Step 3): this synchronous, request-scoped READ was previously fused
 * onto the cron-driven `AnalyticsJobsService` (a query straddling a write
 * class). It is now its own thin service over the {@link IAnalyticsReadModel}
 * port; tenant isolation is enforced inside the implementation via tenantJoin.
 */
@Injectable()
export class StalledIssuesQueryService implements IStalledIssuesQuery {
  constructor(
    @Inject(ANALYTICS_READ_MODEL_TOKEN)
    private readonly readModel: IAnalyticsReadModel,
  ) {}

  getStalledIssues(projectId: string): Promise<StalledIssue[]> {
    return this.readModel.findStalledIssues(projectId, STALL_THRESHOLD_DAYS);
  }
}
