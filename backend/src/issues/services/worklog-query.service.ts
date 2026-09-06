import { Injectable } from '@nestjs/common';

import { WorkLogRepository } from '../../database/repositories/work-log.repository';
import { WorkLog } from '../entities/work-log.entity';
import {
  TimeAggregationResult,
  toAggregationResult,
} from '../dto/time-aggregation-result.interface';
import type { IWorkLogQuery } from '../interfaces/issues.interfaces';

/**
 * WorklogQueryService — work-log read + aggregation surface.
 *
 * Bound to `WORKLOG_QUERY_TOKEN`. Verbatim port of the read methods on
 * the legacy co-located `WorkLogsService`. The minute-sum aggregations
 * are pushed into the abstract `WorkLogRepository` (DIP) and wrapped via
 * `toAggregationResult`.
 */
@Injectable()
export class WorklogQueryService implements IWorkLogQuery {
  constructor(private readonly workLogRepo: WorkLogRepository) {}

  async listWorkLogs(projectId: string, issueId: string): Promise<WorkLog[]> {
    return this.workLogRepo.findMany({
      where: { projectId, issueId },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async getTotalTimeByIssue(issueId: string): Promise<TimeAggregationResult> {
    const total = await this.workLogRepo.sumMinutesByIssue(issueId);
    return toAggregationResult({ total });
  }

  async getTotalTimeByProject(
    projectId: string,
  ): Promise<TimeAggregationResult> {
    const total = await this.workLogRepo.sumMinutesByProject(projectId);
    return toAggregationResult({ total });
  }

  async getTotalTimeByUser(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TimeAggregationResult> {
    const total = await this.workLogRepo.sumMinutesByUser(
      userId,
      startDate,
      endDate,
    );
    return toAggregationResult({ total });
  }

  async getTotalTimeBySprint(sprintId: string): Promise<TimeAggregationResult> {
    const total = await this.workLogRepo.sumMinutesBySprint(sprintId);
    return toAggregationResult({ total });
  }
}
