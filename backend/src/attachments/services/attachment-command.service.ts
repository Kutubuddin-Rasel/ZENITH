// src/attachments/services/attachment-command.service.ts
//
// Attachment Command Service — CQRS Write Side (IAttachmentCommand)
// ----------------------------------------------------------------
// Owns every attachment mutation. Closes the plan's three distributed-transaction
// defects:
//   • CREATE was file-write-then-save with no compensation → a failed save
//     stranded bytes. Now: upload → ACID (row + history in ONE tx) → on failure,
//     compensating `storage.delete(key)`.
//   • DELETE for non-project targets removed the row but NEVER the file (L231
//     TODO). Now EVERY target deletes the file (commit-then-cleanup).
//   • `removeForProject` called `getUserRole` twice. Now exactly once.
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ATTACHMENT_REPOSITORY_TOKEN,
  FILE_STORAGE_PROVIDER,
} from '../constants/attachments.tokens';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  AttachmentContext,
  AttachmentView,
  IAttachmentCommand,
  IAttachmentRepository,
  IStoragePort,
  NewAttachment,
  UploadedFileMeta,
} from '../interfaces/attachments.interfaces';
import { AttachmentTargetRegistry } from './attachment-target.registry';

@Injectable()
export class AttachmentCommandService implements IAttachmentCommand {
  constructor(
    private readonly registry: AttachmentTargetRegistry,
    @Inject(ATTACHMENT_REPOSITORY_TOKEN)
    private readonly repo: IAttachmentRepository,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: IStoragePort,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly memberQuery: IProjectMemberQuery,
    private readonly dataSource: DataSource,
  ) {}

  async createForTarget(
    ctx: AttachmentContext,
    file: UploadedFileMeta,
  ): Promise<AttachmentView> {
    const spec = this.registry.resolve(ctx.target);
    await spec.assertParent(ctx);

    // 1) Persist bytes through the storage port (Local / S3 / Cloudinary).
    const key = await this.storage.upload(file.filepath, {
      filename: file.filename,
      originalName: file.originalName ?? file.filename,
      mimeType: file.mimeType ?? 'application/octet-stream',
      size: file.fileSize ?? 0,
    });

    const data: NewAttachment = {
      uploaderId: ctx.userId,
      filename: key,
      filepath: file.filepath,
      originalName: file.originalName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
    };
    data[spec.column] = this.targetValue(ctx);

    // 2) ACID: metadata row + UPLOADED history in a single unit of work.
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await this.repo.save(this.repo.create(data), manager);
        await this.repo.appendHistory(
          {
            projectId: saved.projectId ?? ctx.projectId,
            attachmentId: saved.id,
            filename: saved.filename,
            originalName: saved.originalName ?? saved.filename,
            action: 'UPLOADED',
            performedById: ctx.userId,
            fileSize: saved.fileSize,
            mimeType: saved.mimeType,
            metadata: this.historyMetadata(saved),
          },
          manager,
        );
        return saved;
      });
    } catch (err) {
      // 3) Compensating transaction: the row never committed, so the uploaded
      //    bytes must not survive. ENOENT-safe in the provider.
      await this.safeDelete(key);
      throw err;
    }
  }

  async removeForTarget(
    ctx: AttachmentContext,
    attachmentId: string,
  ): Promise<void> {
    const spec = this.registry.resolve(ctx.target);
    await spec.assertParent(ctx);

    const att = await this.repo.findOneByTarget(
      spec.column,
      this.targetValue(ctx),
      attachmentId,
    );
    if (!att) {
      throw new NotFoundException('Attachment not found');
    }

    // Single membership fetch drives the uploader-or-lead authz (legacy did 2×).
    const role = await this.memberQuery.getUserRole(ctx.projectId, ctx.userId);
    if (
      att.uploaderId !== ctx.userId &&
      role !== ProjectRole.PROJECT_LEAD &&
      (role as unknown as string) !== 'Super-Admin'
    ) {
      throw new ForbiddenException('Cannot delete this attachment');
    }

    // ACID: drop the row + append DELETED history atomically.
    await this.dataSource.transaction(async (manager) => {
      await this.repo.remove(att, manager);
      await this.repo.appendHistory(
        {
          projectId: att.projectId ?? ctx.projectId,
          attachmentId: att.id,
          filename: att.filename,
          originalName: att.originalName ?? att.filename,
          action: 'DELETED',
          performedById: ctx.userId,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          metadata: this.historyMetadata(att),
        },
        manager,
      );
    });

    // Commit-then-cleanup: the row is gone; now reclaim the bytes for EVERY
    // target type (fixes the non-project orphan leak). Best-effort by design.
    await this.safeDelete(att.filename);
  }

  /** Parent FK value: the nested parent id, or the project id for project-level files. */
  private targetValue(ctx: AttachmentContext): string {
    return ctx.parentId ?? ctx.projectId;
  }

  private historyMetadata(
    att: AttachmentView,
  ): NonNullable<
    Parameters<IAttachmentRepository['appendHistory']>[0]['metadata']
  > {
    return {
      issueId: att.issueId,
      releaseId: att.releaseId,
      sprintId: att.sprintId,
      commentId: att.commentId,
    };
  }

  /** Best-effort byte reclamation; the storage provider is already ENOENT-safe. */
  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Swallow: a failed unlink must not surface as a failed user operation.
      // The row state is already authoritative; orphaned bytes are a sweepable
      // background concern, not a request error.
    }
  }
}
