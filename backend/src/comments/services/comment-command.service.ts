// src/comments/services/comment-command.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ISSUE_QUERY_TOKEN, type IIssueQuery, AuditPort } from '../../issues';
import {
  COMMENT_QUERY_TOKEN,
  COMMENT_REPOSITORY_TOKEN,
} from '../constants/comments.tokens';
import { CommentNotificationPort } from '../ports/comment-notification.port';
import type { CreateCommentDto } from '../dto/create-comment.dto';
import type { UpdateCommentDto } from '../dto/update-comment.dto';
import type {
  ICommentCommand,
  ICommentQuery,
  ICommentRepository,
  CommentView,
} from '../interfaces/comments.interfaces';

@Injectable()
export class CommentCommandService implements ICommentCommand {
  constructor(
    @Inject(COMMENT_REPOSITORY_TOKEN)
    private readonly repo: ICommentRepository,
    @Inject(COMMENT_QUERY_TOKEN) private readonly query: ICommentQuery,
    @Inject(ISSUE_QUERY_TOKEN) private readonly issues: IIssueQuery,
    private readonly audit: AuditPort,
    private readonly notifications: CommentNotificationPort,
  ) {}

  async create(
    projectId: string,
    issueId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentView> {
    await this.issues.findOne(projectId, issueId, authorId);
    const saved = await this.repo.save(
      this.repo.create({ issueId, authorId, content: dto.content }),
    );
    void this.audit.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: authorId,
      resource_type: 'Comment',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: { issueId, contentLength: dto.content.length },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      issueId,
      'commented',
      authorId,
    );
    return saved;
  }

  async update(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentView> {
    const c = await this.query.assertEditable(
      projectId,
      issueId,
      commentId,
      userId,
    );
    const oldLength = c.content.length;
    c.content = dto.content ?? c.content;
    const updated = await this.repo.save(c);
    void this.audit.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Comment',
      resource_id: commentId,
      action_type: 'UPDATE',
      metadata: { issueId, oldLength, newLength: updated.content.length },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      issueId,
      'edited a comment',
      userId,
    );
    return updated;
  }

  async remove(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    const c = await this.query.assertEditable(
      projectId,
      issueId,
      commentId,
      userId,
    );
    const contentLength = c.content.length;
    await this.repo.remove(c);
    void this.audit.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Comment',
      resource_id: commentId,
      action_type: 'DELETE',
      metadata: { issueId, contentLength },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      issueId,
      'deleted a comment',
      userId,
    );
  }
}
