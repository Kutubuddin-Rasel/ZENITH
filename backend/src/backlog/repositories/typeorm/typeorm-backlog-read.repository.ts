import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Issue } from '../../../issues/entities/issue.entity';
import { SprintIssue } from '../../../sprints/entities/sprint-issue.entity';
import type { IssueView } from '../../../issues';
import { BacklogReadRepository } from '../abstract/backlog-read.repository.abstract';

/**
 * TypeORM-backed backlog read projection.
 *
 * Joins the `SprintIssue` **entity class** (not the legacy `'sprint_issues'`
 * magic string) so the relationship is type-checked and survives a table
 * rename. The `getManyAndCount()` result is `[Issue[], number]`, which is
 * assignment-compatible with `[IssueView[], number]` because `IssueView`
 * is a structural subset of `Issue` — the type narrowing IS the projection
 * (no manual `.map()`), keeping the seam at the contract boundary.
 */
@Injectable()
export class TypeOrmBacklogReadRepository extends BacklogReadRepository {
  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {
    super();
  }

  findBacklogPage(
    projectId: string,
    skip: number,
    limit: number,
  ): Promise<[IssueView[], number]> {
    return (
      this.issues
        .createQueryBuilder('issue')
        .leftJoin(SprintIssue, 'si', 'si.issueId = issue.id')
        .where('issue.projectId = :projectId', { projectId })
        .andWhere('si.issueId IS NULL')
        .andWhere('issue.isArchived = :isArchived', { isArchived: false })
        // Deterministic order: primary key + tiebreakers for stable pagination.
        .orderBy('issue.backlogOrder', 'ASC')
        .addOrderBy('issue.createdAt', 'ASC')
        .addOrderBy('issue.id', 'ASC')
        .skip(skip)
        .take(limit)
        .getManyAndCount()
    );
  }
}
