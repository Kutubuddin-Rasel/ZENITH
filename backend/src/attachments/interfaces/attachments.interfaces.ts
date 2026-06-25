// src/attachments/interfaces/attachments.interfaces.ts
//
// Attachments Module — Abstract Contracts (ISP Surface)
// -----------------------------------------------------
// These interfaces are the ONLY allowed coupling point between the attachments
// module and the rest of Zenith. Concrete services, the TypeORM repository
// adapter, and the persistence entities are implementation details that must
// never leak across the module boundary (enforced by the sealed barrel +
// ATTACHMENTS_DEEP_IMPORT_PATTERNS lint in Step 3).
import type { EntityManager } from 'typeorm';
import type {
  IFileStorageProvider,
  FileMetadata,
} from '../storage/interfaces/file-storage-provider.interface';

/**
 * The mandated outbound storage port.
 *
 * The abstraction the plan calls "IStoragePort" ALREADY EXISTS as
 * `IFileStorageProvider` (with Local / S3 / Cloudinary adapters under
 * `storage/`). We CANONICALIZE it here under the architectural name rather than
 * recreate a second seam: every attachment write / delete / download speaks
 * this port, never raw `fs` / `path`.
 */
export type IStoragePort = IFileStorageProvider;
export type { FileMetadata };

/** The five aggregates an attachment can hang off. */
export type AttachmentTarget =
  | 'project'
  | 'issue'
  | 'release'
  | 'sprint'
  | 'comment';

/** The entity FK column that stores each target's parent id. */
export type AttachmentColumn =
  | 'projectId'
  | 'issueId'
  | 'releaseId'
  | 'sprintId'
  | 'commentId';

/**
 * Read projection of an attachment row. The TypeORM `Attachment` entity is
 * structurally assignable to this — consumers speak the view, never the ORM
 * class (no lifecycle decorators, no lazy relations leak across the boundary).
 */
export interface AttachmentView {
  id: string;
  projectId?: string;
  issueId?: string;
  releaseId?: string;
  sprintId?: string;
  commentId?: string;
  uploaderId: string;
  filename: string;
  filepath: string;
  originalName?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: Date;
  uploader?: unknown; // hydrated when relations:['uploader'] is loaded
}

/** Read projection of an audit-history row. */
export interface AttachmentHistoryView {
  id: string;
  projectId: string;
  attachmentId: string;
  filename: string;
  originalName: string;
  action: 'UPLOADED' | 'DELETED';
  performedById: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: Date;
  metadata?: {
    issueId?: string;
    releaseId?: string;
    epicId?: string;
    sprintId?: string;
    commentId?: string;
  };
  performedBy?: unknown; // hydrated when relations:['performedBy'] is loaded
}

/** Write-side shape used to build (not yet persist) a new attachment row. */
export interface NewAttachment {
  projectId?: string;
  issueId?: string;
  releaseId?: string;
  sprintId?: string;
  commentId?: string;
  uploaderId: string;
  filename: string;
  filepath: string;
  originalName?: string;
  fileSize?: number;
  mimeType?: string;
}

/** Write-side shape for an audit-history append. */
export interface NewAttachmentHistory {
  projectId: string;
  attachmentId: string;
  filename: string;
  originalName: string;
  action: 'UPLOADED' | 'DELETED';
  performedById: string;
  fileSize?: number;
  mimeType?: string;
  metadata?: AttachmentHistoryView['metadata'];
}

/**
 * Uploaded-file descriptor handed to the command side AFTER Multer +
 * magic-number + ClamAV validation. Decouples the service from
 * `Express.Multer.File` so the command layer is unit-testable without HTTP.
 */
export interface UploadedFileMeta {
  filename: string;
  filepath: string;
  originalName?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Normalized call context for every attachment operation. Replaces the legacy
 * positional sprawl (`createForRelease(projectId, releaseId, userId, …)`) with
 * one typed shape the registry can dispatch on.
 */
export interface AttachmentContext {
  readonly target: AttachmentTarget;
  readonly projectId: string;
  readonly userId: string;
  /** Parent FK value: issue / release / sprint / comment id. Absent for `project`. */
  readonly parentId?: string;
  /** Owning issue id — REQUIRED for `comment` (assertEditable needs both ids). */
  readonly issueId?: string;
}

/**
 * Strategy contract resolved O(1) from the target registry. Couples each target
 * to (a) its entity FK column and (b) a side-effect-free parent-access probe
 * that routes through the parent aggregate's own domain query token
 * (ISSUE_QUERY_TOKEN / SPRINT_QUERY_TOKEN / RELEASE_QUERY_TOKEN /
 * COMMENT_QUERY_TOKEN / PROJECT_MEMBER_QUERY_TOKEN).
 */
export interface AttachmentTargetSpec {
  readonly column: AttachmentColumn;
  /**
   * Parent-existence + tenant/access guard. Throws NotFound / Forbidden when
   * the parent is absent or out of tenant. MUST NOT write, audit, or notify —
   * safe on read paths.
   */
  assertParent(ctx: AttachmentContext): Promise<void>;
}

/** Read surface (CQRS). Implementations enforce parent access before returning. */
export interface IAttachmentQuery {
  listForTarget(ctx: AttachmentContext): Promise<readonly AttachmentView[]>;
  getHistory(
    projectId: string,
    userId: string,
  ): Promise<readonly AttachmentHistoryView[]>;
  /** Resolve one attachment for download; enforces caller membership itself. */
  findForDownload(
    ctx: AttachmentContext,
    attachmentId: string,
  ): Promise<AttachmentView>;
}

/** Write surface (CQRS). */
export interface IAttachmentCommand {
  createForTarget(
    ctx: AttachmentContext,
    file: UploadedFileMeta,
  ): Promise<AttachmentView>;
  removeForTarget(ctx: AttachmentContext, attachmentId: string): Promise<void>;
}

/**
 * Persistence port — the ClickHouse / other-store swap seam. Every MUTATING
 * method accepts an optional `EntityManager` so it can enlist in the command
 * service's `dataSource.transaction(...)` (ACID create/delete + history append
 * in one atomic unit), mirroring the backlog / issues passthrough convention.
 */
export interface IAttachmentRepository {
  /** Build (not persist) an attachment row. */
  create(data: NewAttachment): AttachmentView;
  save(
    attachment: AttachmentView,
    manager?: EntityManager,
  ): Promise<AttachmentView>;
  /** List attachments where `column` = `value` (single index-backed lookup). */
  findByTarget(
    column: AttachmentColumn,
    value: string,
    withUploader?: boolean,
  ): Promise<AttachmentView[]>;
  /** Resolve one attachment scoped to its target column, or `null`. */
  findOneByTarget(
    column: AttachmentColumn,
    value: string,
    attachmentId: string,
  ): Promise<AttachmentView | null>;
  remove(attachment: AttachmentView, manager?: EntityManager): Promise<void>;
  appendHistory(
    entry: NewAttachmentHistory,
    manager?: EntityManager,
  ): Promise<void>;
  /** Audit-history rows for a project, newest first. */
  listHistory(projectId: string): Promise<AttachmentHistoryView[]>;
}
