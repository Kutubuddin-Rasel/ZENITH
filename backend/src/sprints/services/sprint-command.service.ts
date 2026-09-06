import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AbstractSprintRepository } from '../repositories/abstract/sprint.repository.abstract';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import { Sprint, SprintStatus } from '../entities/sprint.entity';
import { CreateSprintDto } from '../dto/create-sprint.dto';
import { UpdateSprintDto } from '../dto/update-sprint.dto';
import { PROJECT_MEMBER_QUERY_TOKEN } from '../../membership/constants/membership.tokens';
import type { IProjectMemberQuery } from '../../membership/interfaces/membership.interfaces';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  BOARD_COMMAND_TOKEN,
  BOARD_QUERY_TOKEN,
  BoardType,
  type IBoardCommand,
  type IBoardQuery,
} from '../../boards';
import { SPRINT_EVENT_FACTORY_TOKEN } from '../../common/constants/events.tokens';
import type { ISprintEventFactory } from '../../common/interfaces/event-factory.interfaces';
import { SPRINT_SNAPSHOT_TOKEN } from '../constants/sprints.tokens';
import type {
  ISprintCommand,
  ISprintSnapshot,
  SprintView,
} from '../interfaces/sprints.interfaces';

/**
 * SprintCommandService — sprint CRUD plus the `PLANNED → ACTIVE` start
 * transition (`SPRINT_COMMAND_TOKEN`).
 *
 * All mutations enforce `PROJECT_LEAD` authority (create is gated by the
 * controller's `@RequireProjectRole` + an org-scoped existence check).
 * `startSprint` delegates the initial burndown snapshot to the snapshot
 * surface (`SPRINT_SNAPSHOT_TOKEN`) rather than re-implementing it —
 * keeping snapshot ownership in one place (Directive B isolation).
 */
@Injectable()
export class SprintCommandService implements ISprintCommand {
  constructor(
    private readonly sprintRepo: AbstractSprintRepository,
    private readonly projectLookup: ProjectLookupPort,
    @Inject(PROJECT_MEMBER_QUERY_TOKEN)
    private readonly members: IProjectMemberQuery,
    @Inject(BOARD_QUERY_TOKEN)
    private readonly boardQuery: IBoardQuery,
    @Inject(BOARD_COMMAND_TOKEN)
    private readonly boardCommand: IBoardCommand,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SPRINT_EVENT_FACTORY_TOKEN)
    private readonly sprintEventFactory: ISprintEventFactory,
    @Inject(SPRINT_SNAPSHOT_TOKEN)
    private readonly snapshotService: ISprintSnapshot,
  ) {}

  async create(
    projectId: string,
    userId: string,
    dto: CreateSprintDto,
  ): Promise<SprintView> {
    const exists = await this.projectLookup.existsForTenant(projectId);
    if (!exists) throw new NotFoundException('Project not found');

    const sprint = this.sprintRepo.createEntity({ projectId, ...dto });
    if (sprint.status === SprintStatus.ACTIVE) {
      sprint.isActive = true;
    }
    const saved = await this.sprintRepo.save(sprint);

    if (saved.status === SprintStatus.ACTIVE) {
      await this.ensureBoard(projectId, userId, saved.name);
    }

    this.emit(projectId, saved, userId, `created sprint ${saved.name}`);
    return saved;
  }

  async update(
    projectId: string,
    sprintId: string,
    userId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintView> {
    const sprint = await this.resolveForLead(
      projectId,
      sprintId,
      userId,
      'update sprint',
    );

    Object.assign(sprint, dto);
    if (sprint.status === SprintStatus.ACTIVE) {
      sprint.isActive = true;
    }
    const updated = await this.sprintRepo.save(sprint);

    if (updated.status === SprintStatus.ACTIVE) {
      await this.ensureBoard(projectId, userId, updated.name);
    }

    this.emit(projectId, updated, userId, `updated sprint ${updated.name}`);
    return updated;
  }

  async remove(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<void> {
    const sprint = await this.resolveForLead(
      projectId,
      sprintId,
      userId,
      'delete sprint',
    );
    await this.sprintRepo.remove(sprint);
    this.emit(projectId, sprint, userId, `deleted sprint ${sprint.name}`);
  }

  async startSprint(
    projectId: string,
    sprintId: string,
    userId: string,
  ): Promise<SprintView> {
    const sprint = await this.resolveForLead(
      projectId,
      sprintId,
      userId,
      'start sprint',
    );

    sprint.status = SprintStatus.ACTIVE;
    sprint.isActive = true;
    const started = await this.sprintRepo.save(sprint);

    await this.ensureBoard(projectId, userId, started.name);
    this.emit(projectId, started, userId, `started sprint ${started.name}`);

    // Capture the initial burndown snapshot via the dedicated snapshot
    // surface (single owner of snapshot persistence).
    await this.snapshotService.captureSnapshot(sprintId);

    return started;
  }

  /** Load a sprint and assert the caller is the project lead. */
  private async resolveForLead(
    projectId: string,
    sprintId: string,
    userId: string,
    action: string,
  ): Promise<Sprint> {
    const sprint = await this.sprintRepo.findDetailById(projectId, sprintId);
    if (!sprint) throw new NotFoundException('Sprint not found');

    const role = await this.members.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) {
      throw new ForbiddenException(`Only ProjectLead can ${action}`);
    }
    return sprint;
  }

  /**
   * Jira-style: auto-provision a default KANBAN board the first time a
   * sprint goes ACTIVE. Best-effort — never fails the sprint mutation.
   */
  private async ensureBoard(
    projectId: string,
    userId: string,
    sprintName: string,
  ): Promise<void> {
    try {
      const existingBoards = await this.boardQuery.findAll(projectId, userId);
      if (existingBoards.length === 0) {
        await this.boardCommand.create(projectId, userId, {
          name: `${sprintName} Board`,
          type: BoardType.KANBAN,
        });
      }
    } catch (error) {
      console.warn('Failed to create board for sprint:', error);
    }
  }

  private emit(
    projectId: string,
    sprint: Sprint,
    actorId: string,
    action: string,
  ): void {
    const payload = this.sprintEventFactory.create({
      projectId,
      sprintId: sprint.id,
      actorId,
      action,
      sprintName: sprint.name,
    });
    this.eventEmitter.emit('sprint.event', payload);
  }
}
