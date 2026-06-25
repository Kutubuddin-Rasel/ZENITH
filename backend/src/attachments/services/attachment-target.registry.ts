// src/attachments/services/attachment-target.registry.ts
//
// Attachment Target Registry — O(1) Strategy Dispatch
// ---------------------------------------------------
// Collapses the legacy 15-method N×M sprawl (5 parent types ×
// {create, findAll, remove}, each re-implementing the same parent guard) into a
// single `ReadonlyMap<AttachmentTarget, AttachmentTargetSpec>`. Each target binds
// (a) its entity FK column and (b) a side-effect-free parent-access probe that
// routes through the PARENT aggregate's own domain query token — so attachments
// never re-implements another module's tenant rules (DIP); it borrows them.
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
// Sealed sibling modules are consumed through their PUBLIC barrels (enforced by
// each module's <MODULE>_DEEP_IMPORT_PATTERNS lint) — never deep paths.
import { ISSUE_QUERY_TOKEN, type IIssueQuery } from '../../issues';
import { SPRINT_QUERY_TOKEN, type ISprintQuery } from '../../sprints';
import { COMMENT_QUERY_TOKEN, type ICommentQuery } from '../../comments';
import { RELEASE_QUERY_TOKEN, type IReleaseQuery } from '../../releases';
// membership is not sealed yet → direct token/interface paths.
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import {
  AttachmentContext,
  AttachmentTarget,
  AttachmentTargetSpec,
} from '../interfaces/attachments.interfaces';
import { resolveTargetSpec } from '../utils/resolve-target-spec.util';

@Injectable()
export class AttachmentTargetRegistry {
  private readonly registry: ReadonlyMap<
    AttachmentTarget,
    AttachmentTargetSpec
  >;

  constructor(
    @Inject(ISSUE_QUERY_TOKEN) private readonly issueQuery: IIssueQuery,
    @Inject(SPRINT_QUERY_TOKEN) private readonly sprintQuery: ISprintQuery,
    @Inject(RELEASE_QUERY_TOKEN) private readonly releaseQuery: IReleaseQuery,
    @Inject(COMMENT_QUERY_TOKEN) private readonly commentQuery: ICommentQuery,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly memberQuery: IProjectMemberQuery,
  ) {
    this.registry = new Map<AttachmentTarget, AttachmentTargetSpec>([
      [
        'project',
        {
          column: 'projectId',
          assertParent: async (ctx) => this.assertProjectMember(ctx),
        },
      ],
      [
        'issue',
        {
          column: 'issueId',
          assertParent: async (ctx) => {
            await this.issueQuery.findOne(
              ctx.projectId,
              this.requireParent(ctx),
              ctx.userId,
            );
          },
        },
      ],
      [
        'release',
        {
          column: 'releaseId',
          assertParent: async (ctx) => {
            await this.releaseQuery.findOne(
              ctx.projectId,
              this.requireParent(ctx),
              ctx.userId,
            );
          },
        },
      ],
      [
        'sprint',
        {
          column: 'sprintId',
          assertParent: async (ctx) => {
            await this.sprintQuery.findOne(
              ctx.projectId,
              this.requireParent(ctx),
              ctx.userId,
            );
          },
        },
      ],
      [
        'comment',
        {
          column: 'commentId',
          assertParent: async (ctx) => {
            await this.commentQuery.assertEditable(
              ctx.projectId,
              this.requireIssueId(ctx),
              this.requireParent(ctx),
              ctx.userId,
            );
          },
        },
      ],
    ]);
  }

  /** O(1) lookup of a target's column + parent guard; unknown → BadRequest. */
  resolve(target: string): AttachmentTargetSpec {
    return resolveTargetSpec(this.registry, target);
  }

  /**
   * Project-level guard: attachments hung directly off a project require only
   * project membership (there is no nested parent row to resolve). Borrows the
   * membership aggregate's authority via PROJECT_MEMBER_QUERY_TOKEN.
   */
  private async assertProjectMember(ctx: AttachmentContext): Promise<void> {
    const role = await this.memberQuery.getUserRole(ctx.projectId, ctx.userId);
    if (!role) {
      throw new ForbiddenException('Not a project member');
    }
  }

  /** Narrow `parentId?: string` → `string` at the boundary (no unchecked `!`). */
  private requireParent(ctx: AttachmentContext): string {
    if (!ctx.parentId) {
      throw new BadRequestException(
        `Missing parent id for attachment target: ${ctx.target}`,
      );
    }
    return ctx.parentId;
  }

  /** `comment` needs its owning issue id for the COMMENT_QUERY editable probe. */
  private requireIssueId(ctx: AttachmentContext): string {
    if (!ctx.issueId) {
      throw new BadRequestException(
        'Missing issue id for comment attachment target',
      );
    }
    return ctx.issueId;
  }
}
