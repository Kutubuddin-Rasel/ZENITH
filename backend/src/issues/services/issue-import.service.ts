import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { IssueRepository } from '../../database/repositories/issue.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { CACHE_COUNTER_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheCounter } from '../../cache/interfaces/cache.interfaces';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';

import {
  IssuePriority,
  IssueStatus,
  IssueType,
} from '../entities/issue.entity';
import type {
  IIssueImport,
  IssueImportResult,
} from '../interfaces/issues.interfaces';
import { AuditPort } from '../ports/audit.port';
import { UserLookupPort } from '../ports/user-lookup.port';

/**
 * IssueImportService — bulk CSV import surface.
 *
 * Bound to `ISSUE_IMPORT_TOKEN`. Verbatim port of the legacy
 * `importIssues` + the hand-rolled `parseCSV` quote-state machine,
 * including the project-level rate limit, DoS row cap, single summary
 * audit event, and fail-open audit error handling.
 */
@Injectable()
export class IssueImportService implements IIssueImport {
  constructor(
    private readonly issueRepo: IssueRepository,
    private readonly projects: ProjectRepository,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly projectMembersService: IProjectMemberQuery,
    @Inject(CACHE_COUNTER_TOKEN) private readonly cacheCounter: ICacheCounter,
    private readonly userLookup: UserLookupPort,
    private readonly auditPort: AuditPort,
  ) {}

  async importIssues(
    projectId: string,
    fileBuffer: Buffer,
    userId: string,
    organizationId?: string,
  ): Promise<IssueImportResult> {
    if (organizationId) {
      const project = await this.projects.findOne({
        where: { id: projectId, organizationId },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    const role = await this.projectMembersService.getUserRole(
      projectId,
      userId,
    );
    if (!role) {
      throw new ForbiddenException('You are not a member of this project');
    }

    // Project-level rate limit: 20 imports/hour (coordinated-abuse guard).
    const PROJECT_IMPORT_LIMIT = 20;
    const PROJECT_IMPORT_TTL = 3600;
    const rateLimitKey = `rate_limit:project:${projectId}:import`;
    const currentCount = await this.cacheCounter.incr(rateLimitKey, {
      ttl: PROJECT_IMPORT_TTL,
    });

    if (currentCount > PROJECT_IMPORT_LIMIT) {
      throw new HttpException(
        `Project import limit exceeded (${PROJECT_IMPORT_LIMIT}/hour). Please try again later.`,
        429,
      );
    }

    const csvContent = fileBuffer.toString('utf-8');
    const rows = this.parseCSV(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    // DoS protection: cap row count to prevent CPU exhaustion.
    const MAX_IMPORT_ROWS = 10_000;
    if (rows.length > MAX_IMPORT_ROWS + 1) {
      throw new BadRequestException(
        `CSV exceeds maximum row limit of ${MAX_IMPORT_ROWS}. Please split into smaller files.`,
      );
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const dataRows = rows.slice(1);

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    const colMap = {
      title: headers.indexOf('title'),
      description: headers.indexOf('description'),
      status: headers.indexOf('status'),
      priority: headers.indexOf('priority'),
      type: headers.indexOf('type'),
      storyPoints: headers.indexOf('story points'),
      assigneeEmail: headers.indexOf('assignee email'),
      parentTitle: headers.indexOf('parent issue'),
    };

    if (colMap.title === -1) {
      throw new BadRequestException('CSV must contain a "Title" column');
    }

    for (const [index, row] of dataRows.entries()) {
      try {
        const title = row[colMap.title];
        if (!title) continue; // Skip empty rows

        const description =
          colMap.description !== -1 ? row[colMap.description] : undefined;
        const status =
          colMap.status !== -1
            ? (row[colMap.status] as IssueStatus)
            : IssueStatus.TODO;
        const priority =
          colMap.priority !== -1
            ? (row[colMap.priority] as IssuePriority)
            : IssuePriority.MEDIUM;
        const type =
          colMap.type !== -1 ? (row[colMap.type] as IssueType) : undefined;
        const storyPoints =
          colMap.storyPoints !== -1 ? parseInt(row[colMap.storyPoints], 10) : 0;
        const assigneeEmail =
          colMap.assigneeEmail !== -1 ? row[colMap.assigneeEmail] : undefined;
        const parentTitle =
          colMap.parentTitle !== -1 ? row[colMap.parentTitle] : undefined;

        // Resolve assignee.
        let assigneeId: string | undefined;
        if (assigneeEmail) {
          const user = await this.userLookup.findOneByEmail(assigneeEmail);
          if (user) {
            const isMember = await this.projectMembersService.getUserRole(
              projectId,
              user.id,
            );
            if (isMember) assigneeId = user.id;
          }
        }

        // Resolve parent.
        let parentId: string | undefined;
        if (parentTitle) {
          const parent = await this.issueRepo.findOne({
            where: { title: parentTitle, projectId },
          });
          if (parent) parentId = parent.id;
        }

        const issue = this.issueRepo.create({
          projectId,
          title,
          description,
          status,
          priority,
          type,
          storyPoints: isNaN(storyPoints) ? 0 : storyPoints,
          assigneeId,
          reporterId: userId,
          parentId,
        });

        await this.issueRepo.save(issue);
        created++;
      } catch (err) {
        failed++;
        errors.push(`Row ${index + 2}: ${(err as Error).message} `);
      }
    }

    // Audit: ISSUE_IMPORTED — single summary event (avoids log flooding).
    try {
      await this.auditPort.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: 'unknown', // Would need project lookup for full context
        actor_id: userId,
        projectId,
        resource_type: 'Issue',
        resource_id: projectId, // Resource is the project for bulk import
        action_type: 'CREATE',
        action: 'ISSUE_IMPORTED',
        metadata: {
          severity: 'HIGH',
          importedCount: created,
          failedCount: failed,
          totalRows: dataRows.length,
        },
      });
    } catch (auditError) {
      console.error('Audit log failed for ISSUE_IMPORTED:', auditError);
    }

    return { created, failed, errors };
  }

  private parseCSV(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++; // Skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentField);
        currentField = '';
      } else if (
        (char === '\n' || (char === '\r' && nextChar === '\n')) &&
        !insideQuotes
      ) {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // Skip \n
      } else {
        currentField += char;
      }
    }

    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }
}
