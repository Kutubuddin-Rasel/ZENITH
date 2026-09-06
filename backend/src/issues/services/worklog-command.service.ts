import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityNotFoundError } from 'typeorm';

import { WorkLogRepository } from '../../database/repositories/work-log.repository';
import { IssueRepository } from '../../database/repositories/issue.repository';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';

import { Issue } from '../entities/issue.entity';
import { WorkLog } from '../entities/work-log.entity';
import type {
  IWorkLogCommand,
  WorkLogMutationAck,
} from '../interfaces/issues.interfaces';

/**
 * WorklogCommandService — work-log mutation surface.
 *
 * Bound to `WORKLOG_COMMAND_TOKEN`. Verbatim port of the mutating
 * methods on the legacy co-located `WorkLogsService`. Role gating
 * (owner OR `PROJECT_LEAD`) and the `EntityNotFoundError` semantics on
 * `addWorkLog` are preserved exactly.
 */
@Injectable()
export class WorklogCommandService implements IWorkLogCommand {
  constructor(
    private readonly workLogRepo: WorkLogRepository,
    private readonly issueRepo: IssueRepository,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly membersService: IProjectMemberQuery,
  ) {}

  async addWorkLog(
    projectId: string,
    issueId: string,
    userId: string,
    minutesSpent: number,
    note?: string,
    billable?: boolean,
    hourlyRate?: number,
  ): Promise<WorkLog> {
    // Preserve prior `findOneByOrFail` semantics (throws when absent).
    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId },
    });
    if (!issue) {
      throw new EntityNotFoundError(Issue, { id: issueId, projectId });
    }
    const workLog = this.workLogRepo.create({
      projectId,
      issueId,
      userId,
      minutesSpent,
      note,
      billable: billable ?? true,
      hourlyRate:
        hourlyRate !== undefined && hourlyRate !== null
          ? hourlyRate.toFixed(4)
          : null,
    });
    return this.workLogRepo.save(workLog);
  }

  async deleteWorkLog(
    projectId: string,
    issueId: string,
    workLogId: string,
    userId: string,
  ): Promise<WorkLogMutationAck> {
    const workLog = await this.workLogRepo.findOne({
      where: { id: workLogId, projectId, issueId },
    });
    if (!workLog) throw new NotFoundException('Work log not found');
    if (workLog.userId !== userId) {
      const role = await this.membersService.getUserRole(projectId, userId);
      if (role !== ProjectRole.PROJECT_LEAD)
        throw new ForbiddenException('Cannot delete this work log');
    }
    await this.workLogRepo.remove(workLog);
    return { message: 'Work log deleted' };
  }

  async updateWorkLog(
    projectId: string,
    issueId: string,
    workLogId: string,
    userId: string,
    minutesSpent?: number,
    note?: string,
  ): Promise<WorkLog> {
    const workLog = await this.workLogRepo.findOne({
      where: { id: workLogId, projectId, issueId },
    });
    if (!workLog) throw new NotFoundException('Work log not found');
    if (workLog.userId !== userId) {
      const role = await this.membersService.getUserRole(projectId, userId);
      if (role !== ProjectRole.PROJECT_LEAD)
        throw new ForbiddenException('Cannot edit this work log');
    }
    if (minutesSpent !== undefined) workLog.minutesSpent = minutesSpent;
    if (note !== undefined) workLog.note = note;
    return this.workLogRepo.save(workLog);
  }
}
