// src/releases/services/release-command.service.ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AuditPort } from '../../issues';
import { ISSUE_QUERY_TOKEN, type IIssueQuery } from '../../issues';
import { PROJECT_MEMBER_QUERY_TOKEN } from 'src/membership/constants/membership.tokens';
import type { IProjectMemberQuery } from 'src/membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  RELEASE_NOTES_TOKEN,
  RELEASE_QUERY_TOKEN,
  RELEASE_REPOSITORY_TOKEN,
} from '../constants/releases.tokens';
import { ReleaseNotificationPort } from '../ports/release-notification.port';
import type {
  IReleaseCommand,
  IReleaseNotes,
  IReleaseQuery,
  IReleaseRepository,
  ReleaseAttachmentFile,
  ReleaseGitInfo,
} from '../interfaces/releases.interfaces';
import { Release, ReleaseStatus } from '../entities/release.entity';
import type { IssueRelease } from '../entities/issue-release.entity';
import type { ReleaseAttachment } from '../entities/release-attachment.entity';
import type { CreateReleaseDto } from '../dto/create-release.dto';
import type { UpdateReleaseDto } from '../dto/update-release.dto';
import type { AssignIssueDto } from '../dto/assign-issue.dto';
import type { UnassignIssueDto } from '../dto/unassign-issue.dto';

/**
 * Release write surface (RELEASE_COMMAND_TOKEN). Mutations, lifecycle, linking,
 * attachments, and git linkage. Owns NO TypeORM — persistence flows through
 * `IReleaseRepository`; audit/notification side-effects flow through the
 * `AuditPort` (@Global) and `ReleaseNotificationPort` abstractions (the god
 * class injected `AuditLogsService`/`WatchersService` concretely — DIP leak).
 *
 * Reads (existence + membership gate) are delegated to the query surface so the
 * tenant-isolation rule lives in exactly one place.
 */
@Injectable()
export class ReleaseCommandService implements IReleaseCommand {
  constructor(
    @Inject(RELEASE_REPOSITORY_TOKEN)
    private readonly repo: IReleaseRepository,
    @Inject(RELEASE_QUERY_TOKEN) private readonly query: IReleaseQuery,
    @Inject(RELEASE_NOTES_TOKEN) private readonly notes: IReleaseNotes,
    @Inject(ISSUE_QUERY_TOKEN) private readonly issuesService: IIssueQuery,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly membersService: IProjectMemberQuery,
    private readonly audit: AuditPort,
    private readonly notifications: ReleaseNotificationPort,
  ) {}

  /** Assert the caller is the project's lead (write authority). */
  private async assertLead(
    projectId: string,
    userId: string,
    message: string,
  ): Promise<void> {
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(message);
    }
  }

  async create(
    projectId: string,
    userId: string,
    dto: CreateReleaseDto,
  ): Promise<Release> {
    await this.assertLead(
      projectId,
      userId,
      'Only ProjectLead can create releases',
    );
    const saved = await this.repo.saveRelease(
      this.repo.createRelease({ projectId, ...dto }),
    );

    void this.audit.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: {
        event: 'RELEASE_CREATED',
        releaseName: saved.name,
        status: saved.status,
      },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      null,
      `created release ${saved.name}`,
      userId,
    );
    return saved;
  }

  async update(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UpdateReleaseDto,
  ): Promise<Release> {
    const rel = await this.query.findOne(projectId, releaseId, userId);
    await this.assertLead(
      projectId,
      userId,
      'Only ProjectLead can update releases',
    );

    const previousStatus = rel.status;
    const wasReleased = rel.status === ReleaseStatus.RELEASED;

    // Sync deprecated isReleased flag with status for backward compatibility.
    if (dto.status === ReleaseStatus.RELEASED) {
      dto.isReleased = true;
    }

    Object.assign(rel, dto);
    const saved = await this.repo.saveRelease(rel);

    void this.audit.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: saved.id,
      action_type: 'UPDATE',
      metadata: {
        event: 'RELEASE_UPDATED',
        releaseName: saved.name,
        previousStatus,
        newStatus: saved.status,
        fieldsChanged: Object.keys(dto),
        // AuditPort has no top-level `changes`; carry it in metadata.
        changes: dto.status
          ? { status: [previousStatus, saved.status] }
          : undefined,
      },
    });

    if (!wasReleased && saved.status === ReleaseStatus.RELEASED) {
      void this.notifications.notifyWatchersOnEvent(
        projectId,
        null,
        `released ${saved.name}`,
        userId,
      );
    }
    return saved;
  }

  async remove(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<void> {
    const rel = await this.query.findOne(projectId, releaseId, userId);
    await this.assertLead(
      projectId,
      userId,
      'Only ProjectLead can delete releases',
    );

    const releaseName = rel.name;
    const releaseStatus = rel.status;
    await this.repo.removeRelease(rel);

    void this.audit.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: releaseId,
      action_type: 'DELETE',
      metadata: {
        event: 'RELEASE_DELETED',
        releaseName,
        previousStatus: releaseStatus,
        severity: 'HIGH',
      },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      null,
      `deleted release ${releaseName}`,
      userId,
    );
  }

  async archive(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release> {
    return this.update(projectId, releaseId, userId, {
      status: ReleaseStatus.ARCHIVED,
    });
  }

  async assignIssue(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: AssignIssueDto,
  ): Promise<IssueRelease> {
    await this.query.findOne(projectId, releaseId, userId);
    await this.issuesService.findOne(projectId, dto.issueId, userId);

    const existing = await this.repo.findLink(releaseId, dto.issueId);
    if (existing) return existing;

    const saved = await this.repo.saveLink(
      this.repo.createLink(releaseId, dto.issueId),
    );
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      dto.issueId,
      'assigned issue to release',
      userId,
    );
    return saved;
  }

  async unassignIssue(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UnassignIssueDto,
  ): Promise<void> {
    await this.query.findOne(projectId, releaseId, userId);
    const link = await this.repo.findLink(releaseId, dto.issueId);
    if (!link) throw new NotFoundException('Issue not assigned to release');
    await this.repo.removeLink(link);

    void this.notifications.notifyWatchersOnEvent(
      projectId,
      dto.issueId,
      'unassigned issue from release',
      userId,
    );
  }

  async addAttachment(
    projectId: string,
    releaseId: string,
    userId: string,
    file: ReleaseAttachmentFile,
  ): Promise<ReleaseAttachment> {
    await this.query.findOne(projectId, releaseId, userId);
    return this.repo.saveAttachment(
      this.repo.createAttachment({
        releaseId,
        uploaderId: userId,
        filename: file.filename,
        filepath: file.filepath,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
      }),
    );
  }

  async deleteAttachment(
    projectId: string,
    releaseId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.query.findOne(projectId, releaseId, userId);
    const attachment = await this.repo.findAttachment(releaseId, attachmentId);
    if (!attachment) throw new NotFoundException('Attachment not found');
    await this.repo.removeAttachment(attachment);
  }

  async linkGit(
    projectId: string,
    releaseId: string,
    userId: string,
    gitInfo: ReleaseGitInfo,
  ): Promise<Release> {
    const rel = await this.query.findOne(projectId, releaseId, userId);
    await this.assertLead(
      projectId,
      userId,
      'Only ProjectLead can link releases to Git',
    );

    Object.assign(rel, gitInfo);
    const saved = await this.repo.saveRelease(rel);

    void this.notifications.notifyWatchersOnEvent(
      projectId,
      null,
      `linked ${saved.name} to Git tag ${gitInfo.gitTagName || 'N/A'}`,
      userId,
    );
    return saved;
  }

  async generateAndSaveReleaseNotes(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release> {
    const { notes } = await this.notes.generateReleaseNotes(
      projectId,
      releaseId,
      userId,
    );
    return this.update(projectId, releaseId, userId, { description: notes });
  }

  async createRollback(
    projectId: string,
    targetReleaseId: string,
    userId: string,
    newVersionName?: string,
  ): Promise<Release> {
    const targetRelease = await this.query.findOne(
      projectId,
      targetReleaseId,
      userId,
    );
    await this.assertLead(
      projectId,
      userId,
      'Only ProjectLead can create rollbacks',
    );

    const rollbackName = newVersionName || `${targetRelease.name}-rollback`;
    const targetIssues = await this.query.getIssues(
      projectId,
      targetReleaseId,
      userId,
    );

    // ACID: rollback release + all issue links commit together (or not at all).
    // The god class saved the release then looped `await save` per issue —
    // non-atomic (a mid-loop failure orphaned the release) and N round-trips.
    const saved = await this.repo.transaction(async (manager) => {
      const rollback = await this.repo.saveRelease(
        this.repo.createRelease({
          projectId,
          name: rollbackName,
          description: `Rollback to ${targetRelease.name}`,
          status: ReleaseStatus.UPCOMING,
          isRollback: true,
          rollbackFromId: targetReleaseId,
        }),
        manager,
      );
      await this.repo.insertLinks(
        targetIssues.map((issue) => ({
          releaseId: rollback.id,
          issueId: issue.id,
        })),
        manager,
      );
      return rollback;
    });

    void this.audit.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: {
        event: 'RELEASE_ROLLBACK',
        rollbackReleaseName: saved.name,
        sourceReleaseId: targetReleaseId,
        sourceReleaseName: targetRelease.name,
        issuesCopied: targetIssues.length,
        severity: 'CRITICAL',
      },
    });
    void this.notifications.notifyWatchersOnEvent(
      projectId,
      null,
      `created rollback release ${saved.name} from ${targetRelease.name}`,
      userId,
    );
    return saved;
  }
}
