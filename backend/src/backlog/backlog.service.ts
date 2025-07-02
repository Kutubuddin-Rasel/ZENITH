// src/backlog/backlog.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { MoveBacklogItemDto } from './dto/move-backlog-item.dto';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';

@Injectable()
export class BacklogService {
  constructor(
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    private membersService: ProjectMembersService,
  ) {}

  /** List the backlog (all issues not in any sprint?), ordered by backlogOrder */
  async getBacklog(projectId: string, userId: string): Promise<Issue[]> {
    // Ensure user is a project member:
    await this.membersService.getUserRole(projectId, userId);
    // Return all issues for project that are NOT in any sprint, ordered by backlogOrder
    return this.issueRepo
      .createQueryBuilder('issue')
      .leftJoin('sprint_issues', 'si', 'si.issueId = issue.id')
      .where('issue.projectId = :projectId', { projectId })
      .andWhere('si.issueId IS NULL')
      .orderBy('issue.backlogOrder', 'ASC')
      .addOrderBy('issue.createdAt', 'ASC')
      .getMany();
  }

  /** Move one issue to a new position, shifting others as needed */
  async moveItem(
    projectId: string,
    userId: string,
    dto: MoveBacklogItemDto,
  ): Promise<Issue[]> {
    // Only ProjectLead (or super-admin) can reorder:
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') {
      throw new ForbiddenException('Only ProjectLead can reorder backlog');
    }

    // Fetch all issues in backlog sorted:
    const all = await this.issueRepo.find({
      where: { projectId },
      order: { backlogOrder: 'ASC', createdAt: 'ASC' },
    });

    // Find the issue to move:
    const idx = all.findIndex((i) => i.id === dto.issueId);
    if (idx === -1) {
      throw new NotFoundException(`Issue ${dto.issueId} not in backlog`);
    }
    const [moving] = all.splice(idx, 1);

    // Clamp newPosition within bounds:
    const newPos = Math.min(Math.max(dto.newPosition, 0), all.length);
    all.splice(newPos, 0, moving);

    // Reassign backlogOrder sequentially:
    for (let i = 0; i < all.length; i++) {
      all[i].backlogOrder = i;
    }
    // Save all in bulk
    await this.issueRepo.save(all);
    return all;
  }
}
