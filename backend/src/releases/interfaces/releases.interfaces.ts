// src/releases/interfaces/releases.interfaces.ts
//
// Releases Module — Segregated Contracts (ISP Surfaces)
// -----------------------------------------------------
// The 920-line `ReleasesService` god class is decomposed (Step 2) into four
// CQRS services, each implementing exactly ONE of the interfaces below, plus a
// persistence port (`IReleaseRepository`) that isolates TypeORM. Consumers —
// the controller and external modules — depend on these abstractions via DI
// tokens (`constants/releases.tokens.ts`), never the concrete classes.
//
// ISP note: external modules (currently `attachments`) consume `IReleaseQuery`
// solely for a parent-existence check; they only `await findOne(...)` and never
// read its return. `Release` is structurally assignable to the legacy
// `ReleaseView`, so widening this read surface is binary-compatible for them.

import type { EntityManager } from 'typeorm';
import type { Release, ReleaseStatus } from '../entities/release.entity';
import type { IssueRelease } from '../entities/issue-release.entity';
import type { ReleaseAttachment } from '../entities/release-attachment.entity';
import type { Issue } from '../../issues/entities/issue.entity';
import type { CreateReleaseDto } from '../dto/create-release.dto';
import type { UpdateReleaseDto } from '../dto/update-release.dto';
import type { AssignIssueDto } from '../dto/assign-issue.dto';
import type { UnassignIssueDto } from '../dto/unassign-issue.dto';
import type { PaginatedReleasesQueryDto } from '../dto/paginated-releases-query.dto';
import type { PaginatedResponse } from '../dto/paginated-response.dto';

/**
 * Read projection of a release. The TypeORM `Release` entity is structurally
 * assignable to this — preserved as the documented minimal external view.
 */
export interface ReleaseView {
  id: string;
  projectId: string;
  name: string;
  /** `ReleaseStatus` (a string enum) is assignable to `string`. */
  status: string;
}

/** Git linkage projection returned by `getGitInfo` / accepted by `linkGit`. */
export interface ReleaseGitInfo {
  gitTagName?: string;
  gitBranch?: string;
  commitSha?: string;
  gitProvider?: string;
  gitRepoUrl?: string;
}

/** Upload descriptor accepted by `addAttachment` (Multer-agnostic shape). */
export interface ReleaseAttachmentFile {
  filename: string;
  filepath: string;
  mimeType?: string;
  fileSize?: number;
}

/** Result of `generateReleaseNotes` — markdown plus the count it summarised. */
export interface ReleaseNotesResult {
  notes: string;
  issueCount: number;
}

/** Result of `getLatestVersion` / `suggestNextVersion`. */
export interface VersionSuggestion {
  suggested: string;
  current: string | null;
  allVersions: string[];
}

/** Result of `compareReleases` — the symmetric-difference view of two releases. */
export interface ReleaseComparison {
  release1: { id: string; name: string; issueCount: number };
  release2: { id: string; name: string; issueCount: number };
  addedIssues: Issue[];
  removedIssues: Issue[];
  commonIssues: Issue[];
}

/** Result of `triggerDeploy`. */
export interface DeployResult {
  success: boolean;
  statusCode?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Read surface (RELEASE_QUERY_TOKEN)
// ---------------------------------------------------------------------------

/**
 * Release read surface. Implementations MUST enforce the caller's project
 * membership before returning (read-side tenant isolation lives here).
 */
export interface IReleaseQuery {
  /** Resolve a single release (with issue links). Throws NotFound/Forbidden. */
  findOne(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release>;
  /** @deprecated unpaginated list — prefer `findAllPaginated`. */
  findAll(projectId: string, userId: string): Promise<Release[]>;
  findAllPaginated(
    projectId: string,
    userId: string,
    query: PaginatedReleasesQueryDto,
  ): Promise<PaginatedResponse<Release>>;
  getIssues(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Issue[]>;
  getAttachments(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseAttachment[]>;
  getGitInfo(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseGitInfo>;
  compareReleases(
    projectId: string,
    releaseId1: string,
    releaseId2: string,
    userId: string,
  ): Promise<ReleaseComparison>;
  getLatestVersion(projectId: string, userId: string): Promise<string | null>;
  suggestNextVersion(
    projectId: string,
    userId: string,
    bumpType?: 'major' | 'minor' | 'patch',
  ): Promise<VersionSuggestion>;
}

// ---------------------------------------------------------------------------
// Write surface (RELEASE_COMMAND_TOKEN)
// ---------------------------------------------------------------------------

/** Release write surface — mutations, lifecycle, linking, attachments, git. */
export interface IReleaseCommand {
  create(
    projectId: string,
    userId: string,
    dto: CreateReleaseDto,
  ): Promise<Release>;
  update(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UpdateReleaseDto,
  ): Promise<Release>;
  remove(projectId: string, releaseId: string, userId: string): Promise<void>;
  archive(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release>;
  assignIssue(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: AssignIssueDto,
  ): Promise<IssueRelease>;
  unassignIssue(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UnassignIssueDto,
  ): Promise<void>;
  addAttachment(
    projectId: string,
    releaseId: string,
    userId: string,
    file: ReleaseAttachmentFile,
  ): Promise<ReleaseAttachment>;
  deleteAttachment(
    projectId: string,
    releaseId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void>;
  linkGit(
    projectId: string,
    releaseId: string,
    userId: string,
    gitInfo: ReleaseGitInfo,
  ): Promise<Release>;
  generateAndSaveReleaseNotes(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release>;
  createRollback(
    projectId: string,
    targetReleaseId: string,
    userId: string,
    newVersionName?: string,
  ): Promise<Release>;
}

// ---------------------------------------------------------------------------
// Deployment surface (RELEASE_DEPLOYMENT_TOKEN) — SSRF-sensitive
// ---------------------------------------------------------------------------

export interface IReleaseDeployment {
  triggerDeploy(
    projectId: string,
    releaseId: string,
    webhookUrl: string,
    userId: string,
  ): Promise<DeployResult>;
  listWebhooks(projectId: string, userId: string): Promise<unknown[]>;
}

// ---------------------------------------------------------------------------
// Notes-generation surface (RELEASE_NOTES_TOKEN) — pure read/format
// ---------------------------------------------------------------------------

export interface IReleaseNotes {
  generateReleaseNotes(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseNotesResult>;
}

// ---------------------------------------------------------------------------
// Persistence port (RELEASE_REPOSITORY_TOKEN)
// ---------------------------------------------------------------------------

/** Filters/paging the repository's QueryBuilder applies (SRP: built by caller). */
export interface ReleaseListCriteria {
  status?: ReleaseStatus;
  search?: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  skip: number;
  take: number;
}

/**
 * The ONLY abstraction allowed to own TypeORM `Repository<Release|IssueRelease|
 * ReleaseAttachment>`. All QueryBuilders live here (SRP rule: no QueryBuilders
 * in services), and every mutating method accepts an optional `manager?:
 * EntityManager` so callers can enlist the write in a transaction
 * (EntityManager-passthrough). The implementation is swappable behind the token.
 */
export interface IReleaseRepository {
  // --- Release ---
  createRelease(data: Partial<Release>): Release;
  saveRelease(release: Release, manager?: EntityManager): Promise<Release>;
  removeRelease(release: Release, manager?: EntityManager): Promise<void>;
  /** Detail read with `issueLinks` + `issueLinks.issue`. */
  findReleaseDetail(
    projectId: string,
    releaseId: string,
  ): Promise<Release | null>;
  /** @deprecated unpaginated — used only by the legacy `findAll` shim. */
  findAllReleases(projectId: string): Promise<Release[]>;
  findReleasesPaginated(
    projectId: string,
    criteria: ReleaseListCriteria,
  ): Promise<[Release[], number]>;
  /** Projected version names only — single column read for semver math (DSA). */
  findVersionNames(projectId: string): Promise<string[]>;

  // --- IssueRelease (join) ---
  findLinksByRelease(releaseId: string): Promise<IssueRelease[]>;
  findLink(releaseId: string, issueId: string): Promise<IssueRelease | null>;
  createLink(releaseId: string, issueId: string): IssueRelease;
  saveLink(link: IssueRelease, manager?: EntityManager): Promise<IssueRelease>;
  removeLink(link: IssueRelease, manager?: EntityManager): Promise<void>;
  /** Batch link insert (DSA: single round-trip for `createRollback`). */
  insertLinks(
    rows: { releaseId: string; issueId: string }[],
    manager?: EntityManager,
  ): Promise<void>;

  // --- ReleaseAttachment ---
  findAttachmentsByRelease(releaseId: string): Promise<ReleaseAttachment[]>;
  createAttachment(data: Partial<ReleaseAttachment>): ReleaseAttachment;
  saveAttachment(
    attachment: ReleaseAttachment,
    manager?: EntityManager,
  ): Promise<ReleaseAttachment>;
  findAttachment(
    releaseId: string,
    attachmentId: string,
  ): Promise<ReleaseAttachment | null>;
  removeAttachment(
    attachment: ReleaseAttachment,
    manager?: EntityManager,
  ): Promise<void>;

  // --- Transaction boundary ---
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
}
