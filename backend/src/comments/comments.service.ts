// src/comments/comments.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PaginationQueryDto, PaginatedCommentsDto } from './dto/pagination.dto';
import { IssuesService } from '../issues/issues.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { WatchersService } from 'src/watchers/watchers.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ProjectRole } from '../membership/enums/project-role.enum';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private repo: Repository<Comment>,
    private issuesService: IssuesService,
    private membersService: ProjectMembersService,
    private watcherService: WatchersService,
    private auditLogsService: AuditLogsService,
  ) { }

  /** Create a comment under an issue */
  async create(
    projectId: string,
    issueId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    await this.issuesService.findOne(projectId, issueId, authorId);
    const c = this.repo.create({ issueId, authorId, content: dto.content });
    const saved = await this.repo.save(c);

    // AUDIT: Log after successful creation (fire-and-forget)
    void this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: authorId,
      resource_type: 'Comment',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: { issueId, contentLength: dto.content.length },
    });

    // notify watchers that a comment was posted
    void this.watcherService.notifyWatchersOnEvent(
      projectId,
      issueId,
      'commented',
      authorId,
    );

    return saved;
  }

  /**
   * List comments on an issue with PAGINATION
   * Uses findAndCount for offset-based pagination
   */
  async findAll(
    projectId: string,
    issueId: string,
    userId: string,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedCommentsDto> {
    await this.issuesService.findOne(projectId, issueId, userId);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await this.repo.findAndCount({
      where: { issueId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /** Update a comment */
  async update(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<Comment> {
    const c = await this.repo.findOneBy({ id: commentId, issueId });
    if (!c) throw new NotFoundException('Comment not found');

    await this.issuesService.findOne(projectId, issueId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (c.authorId !== userId && role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Cannot edit this comment');
    }

    const oldLength = c.content.length;
    c.content = dto.content ?? c.content;
    const updated = await this.repo.save(c);

    // AUDIT: Log after successful update (fire-and-forget)
    void this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Comment',
      resource_id: commentId,
      action_type: 'UPDATE',
      metadata: { issueId, oldLength, newLength: updated.content.length },
    });

    // notify watchers that a comment was edited
    void this.watcherService.notifyWatchersOnEvent(
      projectId,
      issueId,
      'edited a comment',
      userId,
    );

    return updated;
  }

  /** Delete a comment */
  async remove(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    const c = await this.repo.findOneBy({ id: commentId, issueId });
    if (!c) throw new NotFoundException('Comment not found');

    await this.issuesService.findOne(projectId, issueId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (c.authorId !== userId && role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Cannot delete this comment');
    }

    const contentLength = c.content.length;
    await this.repo.remove(c);

    // AUDIT: Log after successful deletion (fire-and-forget)
    void this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Comment',
      resource_id: commentId,
      action_type: 'DELETE',
      metadata: { issueId, contentLength },
    });

    // notify watchers that a comment was deleted
    void this.watcherService.notifyWatchersOnEvent(
      projectId,
      issueId,
      'deleted a comment',
      userId,
    );
  }
}
