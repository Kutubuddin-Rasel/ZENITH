/**
 * Issues Module — Pure Entity → View-DTO mappers
 *
 * Single conversion layer between the TypeORM entities (`Issue`,
 * `IssueLink`, `WorkLog`) and the public ISP view DTOs
 * (`IssueView`, `SlimIssueView`, `IssueLinkView`, `WorkLogView`)
 * declared in `interfaces/issues.interfaces.ts`.
 *
 * Why a separate file (mirror `boards/mappers/board.mapper.ts`)?
 * ------------------------------------------------------------
 *  - Replaces the legacy inline `toSlimIssue` destructure that lived
 *    on the god class.
 *  - Centralizes null-coercion so the entity's nullable columns are
 *    widened to the interface contract in exactly one place.
 *  - Pure functions, no DI, independently unit-testable.
 *
 * `toBroadcastSlim` preserves the EXACT legacy real-time payload shape
 * (strip `description` + `project`, keep every other column plus the
 * computed `key` when present). The narrower `toSlimIssueView` is the
 * typed projection consumers should depend on once Step 4 narrows the
 * broadcast contract.
 */

import { Issue } from '../entities/issue.entity';
import { IssueLink } from '../entities/issue-link.entity';
import { WorkLog } from '../entities/work-log.entity';
import type {
  IssueLinkView,
  IssueView,
  SlimIssueView,
  WorkLogView,
} from '../interfaces/issues.interfaces';

/**
 * Behavior-preserving real-time payload. Verbatim port of the legacy
 * `IssuesService.toSlimIssue`: strips the heavy `description` column
 * and the `project` relation, forwards everything else (including the
 * computed `key` when the caller passes an enriched issue).
 */
export function toBroadcastSlim(issue: Issue & { key?: string }) {
  // Clone then drop the heavy column + relation. (The legacy god class
  // used a rest-destructure, which trips `no-unused-vars`; this is the
  // lint-clean equivalent with identical output.)
  const slim = { ...issue } as Partial<Issue> & { key?: string };
  delete slim.description;
  delete slim.project;
  return slim;
}

/** Full read projection of an issue row (zero ORM coupling). */
export function toIssueView(issue: Issue & { key?: string }): IssueView {
  return {
    id: issue.id,
    number: issue.number,
    projectId: issue.projectId,
    parentId: issue.parentId,
    title: issue.title,
    description: issue.description,
    statusId: issue.statusId,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assigneeId,
    reporterId: issue.reporterId,
    type: issue.type,
    storyPoints: issue.storyPoints,
    backlogOrder: issue.backlogOrder,
    lexorank: issue.lexorank,
    isArchived: issue.isArchived,
    archivedAt: issue.archivedAt,
    archivedBy: issue.archivedBy,
    dueDate: issue.dueDate,
    labels: issue.labels,
    metadata: issue.metadata,
    version: issue.version,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    key: issue.key,
  };
}

/** Minimal Kanban-card projection of an issue. */
export function toSlimIssueView(
  issue: Issue & { key?: string },
): SlimIssueView {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    statusId: issue.statusId,
    priority: issue.priority,
    type: issue.type,
    assigneeId: issue.assigneeId,
    storyPoints: issue.storyPoints,
    backlogOrder: issue.backlogOrder,
    lexorank: issue.lexorank,
    labels: issue.labels,
    key: issue.key,
  };
}

/** Pure projection of an `IssueLink` row (drops back-pointer relations). */
export function toIssueLinkView(link: IssueLink): IssueLinkView {
  return {
    id: link.id,
    sourceIssueId: link.sourceIssueId,
    targetIssueId: link.targetIssueId,
    type: link.type,
    createdAt: link.createdAt,
  };
}

/** Pure projection of a `WorkLog` row (drops `project`/`issue`/`user`). */
export function toWorkLogView(log: WorkLog): WorkLogView {
  return {
    id: log.id,
    projectId: log.projectId,
    issueId: log.issueId,
    userId: log.userId,
    minutesSpent: log.minutesSpent,
    note: log.note,
    billable: log.billable,
    hourlyRate: log.hourlyRate,
    createdAt: log.createdAt,
  };
}
