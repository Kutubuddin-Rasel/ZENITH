// src/releases/releases.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Release } from './entities/release.entity';
import { IssueRelease } from './entities/issue-release.entity';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { AssignIssueDto } from './dto/assign-issue.dto';
import { UnassignIssueDto } from './dto/unassign-issue.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';
import { WatchersService } from '../watchers/watchers.service';

@Injectable()
export class ReleasesService {
  constructor(
    @InjectRepository(Release)
    private relRepo: Repository<Release>,
    @InjectRepository(IssueRelease)
    private linkRepo: Repository<IssueRelease>,
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
    private issuesService: IssuesService,
    private watchersService: WatchersService,
  ) {}

  /** Create a release & notify */
  async create(
    projectId: string,
    userId: string,
    dto: CreateReleaseDto,
  ): Promise<Release> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can create releases');
    }
    const rel = this.relRepo.create({ projectId, ...dto });
    const saved = await this.relRepo.save(rel);

    this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `created release ${saved.name}`,
      userId,
    );
    return saved;
  }

  /** List releases (no notification) */
  async findAll(projectId: string, userId: string): Promise<Release[]> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    return this.relRepo.find({
      where: { projectId },
      relations: ['issueLinks'],
    });
  }

  /** Get one release (no notification) */
  async findOne(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release> {
    const rel = await this.relRepo.findOne({
      where: { id: releaseId, projectId },
      relations: ['issueLinks', 'issueLinks.issue'],
    });
    if (!rel) throw new NotFoundException('Release not found');
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    return rel;
  }

  /** Update release & notify on isReleased toggle */
  async update(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UpdateReleaseDto,
  ): Promise<Release> {
    const rel = await this.findOne(projectId, releaseId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can update releases');
    }

    const wasReleased = rel.isReleased;
    Object.assign(rel, dto);
    const saved = await this.relRepo.save(rel);

    // notify if flipped to released
    if (!wasReleased && saved.isReleased) {
      this.watchersService.notifyWatchersOnEvent(
        projectId,
        null,
        `released ${saved.name}`,
        userId,
      );
    }

    return saved;
  }

  /** Delete a release & notify */
  async remove(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<void> {
    const rel = await this.findOne(projectId, releaseId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can delete releases');
    }
    await this.relRepo.remove(rel);

    this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `deleted release ${rel.name}`,
      userId,
    );
  }

  /** Assign an issue to a release & notify */
  async assignIssue(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: AssignIssueDto,
  ): Promise<IssueRelease> {
    await this.findOne(projectId, releaseId, userId);
    await this.issuesService.findOne(projectId, dto.issueId, userId);
    const link = this.linkRepo.create({ releaseId, issueId: dto.issueId });
    const saved = await this.linkRepo.save(link);

    this.watchersService.notifyWatchersOnEvent(
      projectId,
      dto.issueId,
      `assigned issue to release`,
      userId,
    );
    return saved;
  }

  /** Unassign an issue from a release & notify */
  async unassignIssue(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UnassignIssueDto,
  ): Promise<void> {
    await this.findOne(projectId, releaseId, userId);
    const link = await this.linkRepo.findOneBy({
      releaseId,
      issueId: dto.issueId,
    });
    if (!link) throw new NotFoundException('Issue not assigned to release');
    await this.linkRepo.remove(link);

    this.watchersService.notifyWatchersOnEvent(
      projectId,
      dto.issueId,
      `unassigned issue from release`,
      userId,
    );
  }
}
