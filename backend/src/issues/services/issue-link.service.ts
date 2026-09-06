import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IssueRepository } from '../../database/repositories/issue.repository';
import { IssueLinkRepository } from '../../database/repositories/issue-link.repository';
import { IssueLink, LinkType } from '../entities/issue-link.entity';
import type { IIssueLinkCommand } from '../interfaces/issues.interfaces';
import { IssueQueryService } from './issue-query.service';

/**
 * IssueLinkService — issue-link sub-aggregate write side.
 *
 * Bound to `ISSUE_LINK_TOKEN`. Pure code-motion of the legacy
 * `addLink` / `removeLink`; access checks reuse `IssueQueryService`
 * (`findOne` enforces tenant + membership on the source issue). The
 * read-side `getLinks` lives on `IssueQueryService`.
 */
@Injectable()
export class IssueLinkService implements IIssueLinkCommand {
  constructor(
    private readonly query: IssueQueryService,
    private readonly issueRepo: IssueRepository,
    private readonly issueLinkRepo: IssueLinkRepository,
  ) {}

  /** Add a semantic link between issues. */
  async addLink(
    projectId: string,
    sourceIssueId: string,
    targetIssueId: string,
    type: LinkType,
    userId: string,
  ): Promise<IssueLink> {
    // Verify source exists and user has access.
    await this.query.findOne(projectId, sourceIssueId, userId);

    // Verify target exists.
    const target = await this.issueRepo.findOne({
      where: { id: targetIssueId },
    });
    if (!target) throw new NotFoundException('Target issue not found');

    if (sourceIssueId === targetIssueId) {
      throw new BadRequestException('Cannot link issue to itself');
    }

    const existing = await this.issueLinkRepo.findOne({
      where: [{ sourceIssueId, targetIssueId }],
    });
    if (existing) throw new BadRequestException('Link already exists');

    const link = this.issueLinkRepo.create({
      sourceIssueId,
      targetIssueId,
      type,
    });
    return this.issueLinkRepo.save(link);
  }

  /** Remove a link. */
  async removeLink(
    projectId: string,
    linkId: string,
    userId: string,
  ): Promise<void> {
    const link = await this.issueLinkRepo.findOne({
      where: { id: linkId },
      relations: ['sourceIssue'],
    });
    if (!link) throw new NotFoundException('Link not found');

    // Check permission on source issue.
    await this.query.findOne(projectId, link.sourceIssueId, userId);

    await this.issueLinkRepo.remove(link);
  }
}
