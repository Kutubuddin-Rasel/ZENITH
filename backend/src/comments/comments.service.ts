// src/comments/comments.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { IssuesService } from '../issues/issues.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { WatchersService } from 'src/watchers/watchers.service';
import { ProjectRole } from '../membership/enums/project-role.enum';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private repo: Repository<Comment>,
    private issuesService: IssuesService,
    private membersService: ProjectMembersService,
    private watcherService: WatchersService,
  ) {}

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

    // notify watchers that a comment was posted
    void this.watcherService.notifyWatchersOnEvent(
      projectId,
      issueId,
      'commented',
      authorId,
    );

    return saved;
  }

  /** List comments on an issue */
  async findAll(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<Comment[]> {
    await this.issuesService.findOne(projectId, issueId, userId);
    return this.repo.find({
      where: { issueId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
    });
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

    c.content = dto.content ?? c.content;
    const updated = await this.repo.save(c);

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

    await this.repo.remove(c);

    // notify watchers that a comment was deleted
    void this.watcherService.notifyWatchersOnEvent(
      projectId,
      issueId,
      'deleted a comment',
      userId,
    );
  }
}
