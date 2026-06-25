// src/attachments/services/attachment-query.service.ts
//
// Attachment Query Service — CQRS Read Side (IAttachmentQuery)
// -----------------------------------------------------------
// Read-only. Resolves the per-target parent guard through the registry, queries
// through the repository port, and never touches `fs` / TypeORM directly.
// `findForDownload` performs the membership check ITSELF — closing the legacy
// `controller → svc['membersService']` private-field reach where the result was
// fetched but ignored (an unenforced authorization bug).
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ATTACHMENT_REPOSITORY_TOKEN } from '../constants/attachments.tokens';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  AttachmentContext,
  AttachmentHistoryView,
  AttachmentView,
  IAttachmentQuery,
  IAttachmentRepository,
} from '../interfaces/attachments.interfaces';
import { AttachmentTargetRegistry } from './attachment-target.registry';

@Injectable()
export class AttachmentQueryService implements IAttachmentQuery {
  constructor(
    private readonly registry: AttachmentTargetRegistry,
    @Inject(ATTACHMENT_REPOSITORY_TOKEN)
    private readonly repo: IAttachmentRepository,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly memberQuery: IProjectMemberQuery,
  ) {}

  async listForTarget(
    ctx: AttachmentContext,
  ): Promise<readonly AttachmentView[]> {
    const spec = this.registry.resolve(ctx.target);
    await spec.assertParent(ctx);
    return this.repo.findByTarget(spec.column, this.targetValue(ctx), true);
  }

  async getHistory(
    projectId: string,
    userId: string,
  ): Promise<readonly AttachmentHistoryView[]> {
    // Audit trail is privileged: ProjectLead / Super-Admin only (legacy parity).
    const role = await this.memberQuery.getUserRole(projectId, userId);
    if (
      role !== ProjectRole.PROJECT_LEAD &&
      (role as unknown as string) !== 'Super-Admin'
    ) {
      throw new ForbiddenException(
        'Only ProjectLead and Super-Admin can view attachment history',
      );
    }
    return this.repo.listHistory(projectId);
  }

  async findForDownload(
    ctx: AttachmentContext,
    attachmentId: string,
  ): Promise<AttachmentView> {
    // SECURITY: enforce membership here (the legacy handler fetched the role and
    // discarded it — downloads were effectively unauthenticated against tenancy).
    const role = await this.memberQuery.getUserRole(ctx.projectId, ctx.userId);
    if (!role) {
      throw new ForbiddenException('Not a project member');
    }
    const spec = this.registry.resolve(ctx.target);
    const attachment = await this.repo.findOneByTarget(
      spec.column,
      this.targetValue(ctx),
      attachmentId,
    );
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  /** Parent FK value: the nested parent id, or the project id for project-level files. */
  private targetValue(ctx: AttachmentContext): string {
    return ctx.parentId ?? ctx.projectId;
  }
}
