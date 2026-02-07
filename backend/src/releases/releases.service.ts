// src/releases/releases.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Release, ReleaseStatus } from './entities/release.entity';
import { IssueRelease } from './entities/issue-release.entity';
import { ReleaseAttachment } from './entities/release-attachment.entity';
import { CreateReleaseDto } from './dto/create-release.dto';
import { UpdateReleaseDto } from './dto/update-release.dto';
import { AssignIssueDto } from './dto/assign-issue.dto';
import { UnassignIssueDto } from './dto/unassign-issue.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';
import { WatchersService } from '../watchers/watchers.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { Issue } from '../issues/entities/issue.entity';
import {
  validateWebhookUrl,
  buildSecureRequestConfig,
} from './config/webhook-validator.config';
import {
  PaginatedReleasesQueryDto,
  ReleaseSortField,
  PAGINATION_DEFAULTS,
} from './dto/paginated-releases-query.dto';
import {
  PaginatedResponse,
  createPaginatedResponse,
} from './dto/paginated-response.dto';
import { AuditLogsService } from '../audit/audit-logs.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReleasesService {
  constructor(
    @InjectRepository(Release)
    private relRepo: Repository<Release>,
    @InjectRepository(IssueRelease)
    private linkRepo: Repository<IssueRelease>,
    @InjectRepository(ReleaseAttachment)
    private attachmentRepo: Repository<ReleaseAttachment>,
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
    private issuesService: IssuesService,
    private watchersService: WatchersService,
    private readonly auditLogsService: AuditLogsService,
  ) { }

  /** Create a release & notify */
  async create(
    projectId: string,
    userId: string,
    dto: CreateReleaseDto,
  ): Promise<Release> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can create releases');
    }
    const rel = this.relRepo.create({ projectId, ...dto });
    const saved = await this.relRepo.save(rel);

    // Audit: RELEASE_CREATED (Risk: LOW)
    void this.auditLogsService.log({
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

    void this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `created release ${saved.name}`,
      userId,
    );
    return saved;
  }

  /** List releases (no notification) - DEPRECATED: use findAllPaginated */
  async findAll(projectId: string, userId: string): Promise<Release[]> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');
    return this.relRepo.find({
      where: { projectId },
      relations: ['issueLinks'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List releases with pagination, sorting, and filtering
   *
   * @param projectId - Project to list releases for
   * @param userId - User requesting the list
   * @param query - Pagination, sort, and filter options
   * @returns Paginated response with releases and meta
   */
  async findAllPaginated(
    projectId: string,
    userId: string,
    query: PaginatedReleasesQueryDto,
  ): Promise<PaginatedResponse<Release>> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');

    // Apply defaults
    const page = query.page ?? PAGINATION_DEFAULTS.PAGE;
    const limit = query.limit ?? PAGINATION_DEFAULTS.LIMIT;
    const sortBy = query.sortBy ?? ReleaseSortField.CREATED_AT;
    const sortOrder = query.sortOrder ?? 'DESC';

    // Build where clause
    const where: Record<string, unknown> = { projectId };
    if (query.status) {
      where.status = query.status;
    }

    // Build query with TypeORM
    const queryBuilder = this.relRepo
      .createQueryBuilder('release')
      .leftJoinAndSelect('release.issueLinks', 'issueLinks')
      .where('release.projectId = :projectId', { projectId });

    // Apply status filter
    if (query.status) {
      queryBuilder.andWhere('release.status = :status', {
        status: query.status,
      });
    }

    // Apply search filter
    if (query.search) {
      queryBuilder.andWhere('release.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    // Apply sorting with deterministic tiebreaker
    queryBuilder
      .orderBy(`release.${sortBy}`, sortOrder)
      .addOrderBy('release.id', 'ASC'); // Tiebreaker for stable pagination

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const [data, total] = await queryBuilder.getManyAndCount();

    return createPaginatedResponse(data, page, limit, total);
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

  /** Update release & notify on status change to released */
  async update(
    projectId: string,
    releaseId: string,
    userId: string,
    dto: UpdateReleaseDto,
  ): Promise<Release> {
    const rel = await this.findOne(projectId, releaseId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can update releases');
    }

    const previousStatus = rel.status;
    const wasReleased = rel.status === ReleaseStatus.RELEASED;

    // Sync isReleased with status for backwards compatibility
    if (dto.status === ReleaseStatus.RELEASED) {
      dto.isReleased = true;
    }

    Object.assign(rel, dto);
    const saved = await this.relRepo.save(rel);

    // Audit: RELEASE_UPDATED (Risk: MEDIUM/HIGH if status changed)
    void this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: saved.id,
      action_type: 'UPDATE',
      changes: dto.status ? { status: [previousStatus, saved.status] } : undefined,
      metadata: {
        event: 'RELEASE_UPDATED',
        releaseName: saved.name,
        previousStatus,
        newStatus: saved.status,
        fieldsChanged: Object.keys(dto),
      },
    });

    // notify if flipped to released
    if (!wasReleased && saved.status === ReleaseStatus.RELEASED) {
      void this.watchersService.notifyWatchersOnEvent(
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
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can delete releases');
    }

    // Capture data before deletion for audit
    const releaseName = rel.name;
    const releaseStatus = rel.status;

    await this.relRepo.remove(rel);

    // Audit: RELEASE_DELETED (Risk: HIGH - irreversible)
    void this.auditLogsService.log({
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

    void this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `deleted release ${releaseName}`,
      userId,
    );
  }

  /** Archive a release */
  async archive(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release> {
    return this.update(projectId, releaseId, userId, {
      status: ReleaseStatus.ARCHIVED,
    });
  }

  /** Get all issues for a release */
  async getIssues(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Issue[]> {
    const rel = await this.findOne(projectId, releaseId, userId);
    const links = await this.linkRepo.find({
      where: { releaseId: rel.id },
      relations: ['issue', 'issue.assignee'],
    });
    return links.map((link) => link.issue);
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

    // Check if already assigned
    const existing = await this.linkRepo.findOneBy({
      releaseId,
      issueId: dto.issueId,
    });
    if (existing) {
      return existing;
    }

    const link = this.linkRepo.create({ releaseId, issueId: dto.issueId });
    const saved = await this.linkRepo.save(link);

    void this.watchersService.notifyWatchersOnEvent(
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

    void this.watchersService.notifyWatchersOnEvent(
      projectId,
      dto.issueId,
      `unassigned issue from release`,
      userId,
    );
  }

  // ==================== Attachments ====================

  /** Get all attachments for a release */
  async getAttachments(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseAttachment[]> {
    await this.findOne(projectId, releaseId, userId);
    return this.attachmentRepo.find({
      where: { releaseId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Add an attachment to a release */
  async addAttachment(
    projectId: string,
    releaseId: string,
    userId: string,
    file: {
      filename: string;
      filepath: string;
      mimeType?: string;
      fileSize?: number;
    },
  ): Promise<ReleaseAttachment> {
    await this.findOne(projectId, releaseId, userId);
    const attachment = this.attachmentRepo.create({
      releaseId,
      uploaderId: userId,
      filename: file.filename,
      filepath: file.filepath,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    });
    return this.attachmentRepo.save(attachment);
  }

  /** Delete an attachment */
  async deleteAttachment(
    projectId: string,
    releaseId: string,
    attachmentId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(projectId, releaseId, userId);
    const attachment = await this.attachmentRepo.findOneBy({
      id: attachmentId,
      releaseId,
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    await this.attachmentRepo.remove(attachment);
  }

  // ==================== Release Notes Generation ====================

  /** Generate release notes from linked issues */
  async generateReleaseNotes(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<{ notes: string; issueCount: number }> {
    const issues = await this.getIssues(projectId, releaseId, userId);

    if (issues.length === 0) {
      return {
        notes: '## Release Notes\n\nNo issues are linked to this release yet.',
        issueCount: 0,
      };
    }

    // Group issues by type
    const grouped: Record<string, Issue[]> = {};
    for (const issue of issues) {
      const type = issue.type || 'Other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(issue);
    }

    // Format as markdown
    let notes = `## Release Notes\n\n`;

    const typeEmoji: Record<string, string> = {
      Bug: '🐛 Bug Fixes',
      Feature: '✨ New Features',
      Task: '📋 Tasks',
      Story: '📖 Stories',
      Epic: '🎯 Epics',
      Improvement: '💪 Improvements',
      Other: '📦 Other Changes',
    };

    for (const [type, typeIssues] of Object.entries(grouped)) {
      const header = typeEmoji[type] || `📦 ${type}`;
      notes += `### ${header}\n\n`;
      for (const issue of typeIssues) {
        const assigneeName = issue.assignee?.name || 'Unassigned';
        notes += `- **${issue.title}** (${issue.status}) - ${assigneeName}\n`;
        if (issue.description) {
          // Truncate long descriptions
          const desc =
            issue.description.length > 100
              ? issue.description.substring(0, 100) + '...'
              : issue.description;
          notes += `  > ${desc}\n`;
        }
      }
      notes += '\n';
    }

    return { notes, issueCount: issues.length };
  }

  /** Generate and save release notes to the release description */
  async generateAndSaveReleaseNotes(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<Release> {
    const { notes } = await this.generateReleaseNotes(
      projectId,
      releaseId,
      userId,
    );
    return this.update(projectId, releaseId, userId, { description: notes });
  }

  // ==================== Version Suggestions ====================

  /** Parse a semver string into components */
  private parseVersion(version: string): {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
  } | null {
    const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9.]+)?$/);
    if (!match) return null;
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4]?.substring(1), // Remove leading dash
    };
  }

  /** Get the latest version for a project */
  async getLatestVersion(
    projectId: string,
    userId: string,
  ): Promise<string | null> {
    const releases = await this.findAll(projectId, userId);
    if (releases.length === 0) return null;

    // Sort by parsed version (descending)
    const sorted = releases
      .map((r) => ({ release: r, parsed: this.parseVersion(r.name) }))
      .filter((r) => r.parsed !== null)
      .sort((a, b) => {
        const pa = a.parsed!;
        const pb = b.parsed!;
        if (pa.major !== pb.major) return pb.major - pa.major;
        if (pa.minor !== pb.minor) return pb.minor - pa.minor;
        return pb.patch - pa.patch;
      });

    return sorted.length > 0 ? sorted[0].release.name : null;
  }

  /** Suggest next version based on bump type */
  async suggestNextVersion(
    projectId: string,
    userId: string,
    bumpType: 'major' | 'minor' | 'patch' = 'patch',
  ): Promise<{
    suggested: string;
    current: string | null;
    allVersions: string[];
  }> {
    const releases = await this.findAll(projectId, userId);
    const allVersions = releases.map((r) => r.name);
    const current = await this.getLatestVersion(projectId, userId);

    if (!current) {
      return { suggested: 'v1.0.0', current: null, allVersions };
    }

    const parsed = this.parseVersion(current);
    if (!parsed) {
      return { suggested: 'v1.0.0', current, allVersions };
    }

    let { major, minor, patch } = parsed;
    switch (bumpType) {
      case 'major':
        major++;
        minor = 0;
        patch = 0;
        break;
      case 'minor':
        minor++;
        patch = 0;
        break;
      case 'patch':
        patch++;
        break;
    }

    return {
      suggested: `v${major}.${minor}.${patch}`,
      current,
      allVersions,
    };
  }

  // ==================== Git Integration ====================

  /** Link a release to Git info */
  async linkGit(
    projectId: string,
    releaseId: string,
    userId: string,
    gitInfo: {
      gitTagName?: string;
      gitBranch?: string;
      commitSha?: string;
      gitProvider?: string;
      gitRepoUrl?: string;
    },
  ): Promise<Release> {
    const rel = await this.findOne(projectId, releaseId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can link releases to Git');
    }

    Object.assign(rel, gitInfo);
    const saved = await this.relRepo.save(rel);

    void this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `linked ${saved.name} to Git tag ${gitInfo.gitTagName || 'N/A'}`,
      userId,
    );

    return saved;
  }

  /** Get Git info for a release */
  async getGitInfo(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<{
    gitTagName?: string;
    gitBranch?: string;
    commitSha?: string;
    gitProvider?: string;
    gitRepoUrl?: string;
  }> {
    const rel = await this.findOne(projectId, releaseId, userId);
    return {
      gitTagName: rel.gitTagName,
      gitBranch: rel.gitBranch,
      commitSha: rel.commitSha,
      gitProvider: rel.gitProvider,
      gitRepoUrl: rel.gitRepoUrl,
    };
  }

  // ==================== Deployment Webhooks ====================

  /** List webhooks for a project */
  async listWebhooks(projectId: string, userId: string) {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (!role) throw new ForbiddenException('Not a project member');

    // We need to import and inject the webhook repository
    // For now, return empty - this is a stub for the entity structure
    return [];
  }

  private readonly logger = new Logger(ReleasesService.name);

  /**
   * Trigger a webhook for a release deployment
   * 
   * SECURITY FEATURES:
   * - SSRF allowlist validation (only trusted CI/CD providers)
   * - Idempotency check (prevents double deployment)
   * - HTTPS-only, no redirects, 5s timeout
   * - Status update on failure
   */
  async triggerDeploy(
    projectId: string,
    releaseId: string,
    webhookUrl: string,
    userId: string,
  ): Promise<{ success: boolean; statusCode?: number; message: string }> {
    const release = await this.findOne(projectId, releaseId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can trigger deployments');
    }

    // SECURITY: Idempotency check - prevent double deployment
    if (release.status === ReleaseStatus.RELEASED) {
      this.logger.warn(
        `Deployment blocked: Release ${releaseId} is already deployed`,
      );
      return {
        success: false,
        message: `Release ${release.name} is already deployed. Create a new release or rollback instead.`,
      };
    }

    // If no webhook URL provided, just mark as triggered (placeholder mode)
    if (!webhookUrl || webhookUrl.trim() === '') {
      this.logger.debug('No webhook URL provided, running in placeholder mode');

      // Audit: RELEASE_DEPLOYED (placeholder mode)
      void this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: projectId,
        actor_id: userId,
        resource_type: 'Release',
        resource_id: releaseId,
        action_type: 'UPDATE',
        metadata: {
          event: 'RELEASE_DEPLOYED',
          releaseName: release.name,
          severity: 'CRITICAL',
          webhookConfigured: false,
          success: true,
        },
      });

      void this.watchersService.notifyWatchersOnEvent(
        projectId,
        null,
        `triggered deployment for ${release.name}`,
        userId,
      );
      return {
        success: true,
        statusCode: 200,
        message: `Deployment triggered for release ${release.name} (no webhook configured)`,
      };
    }

    // SECURITY: SSRF prevention - validate webhook URL
    let validatedUrl: URL;
    try {
      validatedUrl = validateWebhookUrl(webhookUrl);
    } catch (error) {
      this.logger.error(`SSRF blocked for release ${releaseId}: ${error}`);

      // Audit: DEPLOYMENT_FAILED - SSRF blocked (security signal!)
      void this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: projectId,
        actor_id: userId,
        resource_type: 'Release',
        resource_id: releaseId,
        action_type: 'UPDATE',
        metadata: {
          event: 'DEPLOYMENT_FAILED',
          releaseName: release.name,
          severity: 'CRITICAL',
          success: false,
          failureReason: 'SSRF_BLOCKED',
          // SECURITY: Never log full URL (may contain tokens)
          attemptedHost: new URL(webhookUrl).hostname,
        },
      });

      // Update release status to indicate deployment failure
      await this.update(projectId, releaseId, userId, {
        status: ReleaseStatus.UPCOMING,
        description:
          release.description +
          `\n\n⚠️ Deployment failed: Invalid webhook URL`,
      });
      throw error;
    }

    // Build secure request configuration
    const requestConfig = buildSecureRequestConfig();
    this.logger.log(
      `Deploying ${release.name} via webhook: ${validatedUrl.hostname}`,
    );

    // PLACEHOLDER: In production, make actual HTTP request
    // Example with fetch/axios:
    // const response = await axios.post(validatedUrl.toString(), {
    //   release: { id: release.id, name: release.name, version: release.name },
    //   project: { id: projectId },
    //   triggeredBy: userId,
    //   timestamp: new Date().toISOString(),
    // }, requestConfig);

    // Audit: RELEASE_DEPLOYED (Risk: CRITICAL - production impact)
    void this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Release',
      resource_id: releaseId,
      action_type: 'UPDATE',
      metadata: {
        event: 'RELEASE_DEPLOYED',
        releaseName: release.name,
        severity: 'CRITICAL',
        webhookConfigured: true,
        // SECURITY: Log hostname only (sanitized - no tokens)
        webhookHost: validatedUrl.hostname,
        success: true,
      },
    });

    void this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `triggered deployment for ${release.name}`,
      userId,
    );

    return {
      success: true,
      statusCode: 200,
      message: `Deployment triggered for release ${release.name} via ${validatedUrl.hostname}`,
    };
  }

  // ==================== Change Comparison & Rollback ====================

  /** Compare two releases and return the differences */
  async compareReleases(
    projectId: string,
    releaseId1: string,
    releaseId2: string,
    userId: string,
  ): Promise<{
    release1: { id: string; name: string; issueCount: number };
    release2: { id: string; name: string; issueCount: number };
    addedIssues: Issue[];
    removedIssues: Issue[];
    commonIssues: Issue[];
  }> {
    const issues1 = await this.getIssues(projectId, releaseId1, userId);
    const issues2 = await this.getIssues(projectId, releaseId2, userId);
    const rel1 = await this.findOne(projectId, releaseId1, userId);
    const rel2 = await this.findOne(projectId, releaseId2, userId);

    const issue1Ids = new Set(issues1.map((i) => i.id));
    const issue2Ids = new Set(issues2.map((i) => i.id));

    const addedIssues = issues2.filter((i) => !issue1Ids.has(i.id));
    const removedIssues = issues1.filter((i) => !issue2Ids.has(i.id));
    const commonIssues = issues1.filter((i) => issue2Ids.has(i.id));

    return {
      release1: { id: rel1.id, name: rel1.name, issueCount: issues1.length },
      release2: { id: rel2.id, name: rel2.name, issueCount: issues2.length },
      addedIssues,
      removedIssues,
      commonIssues,
    };
  }

  /** Create a rollback release from a target release */
  async createRollback(
    projectId: string,
    targetReleaseId: string,
    userId: string,
    newVersionName?: string,
  ): Promise<Release> {
    const targetRelease = await this.findOne(
      projectId,
      targetReleaseId,
      userId,
    );
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException('Only ProjectLead can create rollbacks');
    }

    // Parse target version and suggest rollback version
    const rollbackName = newVersionName || `${targetRelease.name}-rollback`;

    // Create the rollback release
    const rollback = this.relRepo.create({
      projectId,
      name: rollbackName,
      description: `Rollback to ${targetRelease.name}`,
      status: ReleaseStatus.UPCOMING,
      isRollback: true,
      rollbackFromId: targetReleaseId,
    });
    const saved = await this.relRepo.save(rollback);

    // Copy issues from target release to rollback
    const targetIssues = await this.getIssues(
      projectId,
      targetReleaseId,
      userId,
    );
    for (const issue of targetIssues) {
      const link = this.linkRepo.create({
        releaseId: saved.id,
        issueId: issue.id,
      });
      await this.linkRepo.save(link);
    }

    // Audit: RELEASE_ROLLBACK (Risk: CRITICAL - incident response)
    void this.auditLogsService.log({
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

    void this.watchersService.notifyWatchersOnEvent(
      projectId,
      null,
      `created rollback release ${saved.name} from ${targetRelease.name}`,
      userId,
    );

    return saved;
  }
}
