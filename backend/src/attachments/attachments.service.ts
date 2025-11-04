// src/attachments/attachments.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from './entities/attachment.entity';
import { IssuesService } from '../issues/issues.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { ReleasesService } from '../releases/releases.service';
import { EpicsService } from '../epics/epics.service';
import { SprintsService } from '../sprints/sprints.service';
import { CommentsService } from '../comments/comments.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private repo: Repository<Attachment>,
    private issuesService: IssuesService,
    private membersService: ProjectMembersService,
    private releasesService: ReleasesService,
    private epicsService: EpicsService,
    private sprintsService: SprintsService,
    private commentsService: CommentsService,
  ) {}

  // Project-level attachments (general project files)
  async createForProject(
    projectId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
    originalName: string,
    fileSize: number,
    mimeType: string,
  ): Promise<Attachment> {
    // Verify user is a member of the project
    await this.membersService.getUserRole(projectId, uploaderId);

    const att = this.repo.create({
      projectId,
      uploaderId,
      filename,
      filepath,
      originalName,
      fileSize,
      mimeType,
    });
    return this.repo.save(att);
  }

  async findAllForProject(
    projectId: string,
    userId: string,
  ): Promise<Attachment[]> {
    // Verify user is a member of the project
    await this.membersService.getUserRole(projectId, userId);
    return this.repo.find({
      where: { projectId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async findForProject(
    projectId: string,
    attachmentId: string,
  ): Promise<Attachment | null> {
    return this.repo.findOne({
      where: { id: attachmentId, projectId },
    });
  }

  async removeForProject(
    projectId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    // Verify user is a member of the project
    await this.membersService.getUserRole(projectId, userId);

    const att = await this.repo.findOneBy({ id: attachmentId, projectId });
    if (!att) throw new NotFoundException('Attachment not found');

    // Only uploader or ProjectLead/Super-Admin can delete
    const role = await this.membersService.getUserRole(projectId, userId);
    if (
      att.uploaderId !== userId &&
      role !== 'ProjectLead' &&
      role !== 'Super-Admin'
    ) {
      throw new ForbiddenException('Cannot delete this attachment');
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), 'uploads', att.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.repo.remove(att);
  }

  /** Save metadata after upload */
  async create(
    projectId: string,
    issueId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
  ): Promise<Attachment> {
    // verify membership & issue
    await this.issuesService.findOne(projectId, issueId, uploaderId);
    const att = this.repo.create({ issueId, uploaderId, filename, filepath });
    return this.repo.save(att);
  }

  /** List attachments for an issue */
  async findAll(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<Attachment[]> {
    await this.issuesService.findOne(projectId, issueId, userId);
    return this.repo.find({ where: { issueId } });
  }

  /** Delete attachment */
  async remove(
    projectId: string,
    issueId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    // verify membership
    await this.issuesService.findOne(projectId, issueId, userId);
    const att = await this.repo.findOneBy({ id: attachmentId, issueId });
    if (!att) throw new NotFoundException('Attachment not found');
    // only uploader or ProjectLead
    const role = await this.membersService.getUserRole(projectId, userId);
    if (att.uploaderId !== userId && role !== 'ProjectLead') {
      throw new ForbiddenException('Cannot delete this attachment');
    }
    await this.repo.remove(att);
    // TODO: also delete file from disk/storage
  }

  async createForIssue(
    projectId: string,
    issueId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
  ): Promise<Attachment> {
    await this.issuesService.findOne(projectId, issueId, uploaderId);
    const att = this.repo.create({ issueId, uploaderId, filename, filepath });
    return this.repo.save(att);
  }

  async createForRelease(
    projectId: string,
    releaseId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
  ): Promise<Attachment> {
    await this.releasesService.findOne(projectId, releaseId, uploaderId);
    const att = this.repo.create({ releaseId, uploaderId, filename, filepath });
    return this.repo.save(att);
  }

  async findAllForIssue(
    projectId: string,
    issueId: string,
    userId: string,
  ): Promise<Attachment[]> {
    await this.issuesService.findOne(projectId, issueId, userId);
    return this.repo.find({ where: { issueId } });
  }

  async findAllForRelease(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Attachment[]> {
    await this.releasesService.findOne(projectId, releaseId, userId);
    return this.repo.find({ where: { releaseId } });
  }

  async removeForIssue(
    projectId: string,
    issueId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.issuesService.findOne(projectId, issueId, userId);
    const att = await this.repo.findOneBy({ id: attachmentId, issueId });
    if (!att) throw new NotFoundException('Attachment not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (att.uploaderId !== userId && role !== 'ProjectLead') {
      throw new ForbiddenException('Cannot delete this attachment');
    }
    await this.repo.remove(att);
  }

  async removeForRelease(
    projectId: string,
    releaseId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.releasesService.findOne(projectId, releaseId, userId);
    const att = await this.repo.findOneBy({ id: attachmentId, releaseId });
    if (!att) throw new NotFoundException('Attachment not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (att.uploaderId !== userId && role !== 'ProjectLead') {
      throw new ForbiddenException('Cannot delete this attachment');
    }
    await this.repo.remove(att);
  }

  // Epic attachments
  async createForEpic(
    projectId: string,
    epicId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
  ): Promise<Attachment> {
    await this.epicsService.getEpic(projectId, epicId, uploaderId);
    const att = this.repo.create({ epicId, uploaderId, filename, filepath });
    return this.repo.save(att);
  }

  async findAllForEpic(
    projectId: string,
    epicId: string,
    userId: string,
  ): Promise<Attachment[]> {
    await this.epicsService.getEpic(projectId, epicId, userId);
    return this.repo.find({ where: { epicId } });
  }

  async removeForEpic(
    projectId: string,
    epicId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.epicsService.getEpic(projectId, epicId, userId);
    const att = await this.repo.findOneBy({ id: attachmentId, epicId });
    if (!att) throw new NotFoundException('Attachment not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (att.uploaderId !== userId && role !== 'ProjectLead') {
      throw new ForbiddenException('Cannot delete this attachment');
    }
    await this.repo.remove(att);
  }

  // Sprint attachments
  async createForSprint(
    projectId: string,
    sprintId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
  ): Promise<Attachment> {
    await this.sprintsService.findOne(projectId, sprintId, uploaderId);
    const att = this.repo.create({ sprintId, uploaderId, filename, filepath });
    return this.repo.save(att);
  }

  async findAllForSprint(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<Attachment[]> {
    await this.sprintsService.findOne(projectId, sprintId, userId);
    return this.repo.find({
      where: { sprintId },
      relations: ['uploader'],
    });
  }

  async removeForSprint(
    projectId: string,
    sprintId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.sprintsService.findOne(projectId, sprintId, userId);
    const att = await this.repo.findOneBy({ id: attachmentId, sprintId });
    if (!att) throw new NotFoundException('Attachment not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (att.uploaderId !== userId && role !== 'ProjectLead') {
      throw new ForbiddenException('Cannot delete this attachment');
    }
    await this.repo.remove(att);
  }

  // Comment attachments
  async createForComment(
    projectId: string,
    issueId: string,
    commentId: string,
    uploaderId: string,
    filename: string,
    filepath: string,
  ): Promise<Attachment> {
    await this.commentsService.update(
      projectId,
      issueId,
      commentId,
      uploaderId,
      {},
    ); // just to check access
    const att = this.repo.create({ commentId, uploaderId, filename, filepath });
    return this.repo.save(att);
  }

  async findAllForComment(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
  ): Promise<Attachment[]> {
    await this.commentsService.update(
      projectId,
      issueId,
      commentId,
      userId,
      {},
    ); // just to check access
    return this.repo.find({ where: { commentId } });
  }

  async removeForComment(
    projectId: string,
    issueId: string,
    commentId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.commentsService.update(
      projectId,
      issueId,
      commentId,
      userId,
      {},
    ); // just to check access
    const att = await this.repo.findOneBy({ id: attachmentId, commentId });
    if (!att) throw new NotFoundException('Attachment not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (att.uploaderId !== userId && role !== 'ProjectLead') {
      throw new ForbiddenException('Cannot delete this attachment');
    }
    await this.repo.remove(att);
  }
}
