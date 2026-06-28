// src/comments/services/comment-query.service.ts
import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ISSUE_QUERY_TOKEN, type IIssueQuery } from '../../issues';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { COMMENT_REPOSITORY_TOKEN } from '../constants/comments.tokens';
import { encodeCursor, decodeCursor } from '../utils/comment-cursor.util';
import type {
  ICommentQuery,
  ICommentRepository,
  CommentView,
  OffsetPage,
  PaginatedComments,
  KeysetComments,
} from '../interfaces/comments.interfaces';

@Injectable()
export class CommentQueryService implements ICommentQuery {
  constructor(
    @Inject(COMMENT_REPOSITORY_TOKEN)
    private readonly repo: ICommentRepository,
    @Inject(ISSUE_QUERY_TOKEN) private readonly issues: IIssueQuery,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
  ) {}

  async findAll(
    projectId: string,
    issueId: string,
    userId: string,
    page: OffsetPage,
  ): Promise<PaginatedComments> {
    await this.issues.findOne(projectId, issueId, userId);
    const { page: p, limit } = page;
    const [data, total] = await this.repo.listOffset(
      issueId,
      (p - 1) * limit,
      limit,
    );
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        page: p,
        limit,
        totalPages,
        hasNextPage: p < totalPages,
        hasPrevPage: p > 1,
      },
    };
  }

  async findAllKeyset(
    projectId: string,
    issueId: string,
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<KeysetComments> {
    await this.issues.findOne(projectId, issueId, userId);
    const rows = await this.repo.listKeyset(
      issueId,
      limit + 1,
      decodeCursor(cursor),
    );
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async assertEditable(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
  ): Promise<CommentView> {
    const c = await this.repo.findOne(issueId, commentId);
    if (!c) throw new NotFoundException('Comment not found');
    await this.issues.findOne(projectId, issueId, userId);
    const role = await this.members.getUserRole(projectId, userId);
    if (c.authorId !== userId && role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Cannot modify this comment');
    }
    return c;
  }
}
