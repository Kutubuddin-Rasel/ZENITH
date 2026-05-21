import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import { AuditLogsService } from '../../audit/audit-logs.service';
import { AbstractProjectMemberRepository } from '../repositories/abstract/project-member.repository.abstract';
import { ProjectMember } from '../entities/project-member.entity';
import { ProjectRole } from '../enums/project-role.enum';
import { PROJECT_MEMBER_POLICY_TOKEN } from '../constants/membership.tokens';
import {
  AddMemberCommand,
  IProjectMemberCommand,
  IProjectMemberPolicy,
  ProjectMemberSummary,
  UpdateMemberRoleCommand,
} from '../interfaces/membership.interfaces';
import {
  MEMBERSHIP_EVENTS,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleChangedEvent,
} from '../events/membership-events';

/**
 * ProjectMemberCommandService
 *
 * Write-side implementation of `IProjectMemberCommand`. Bound to
 * `PROJECT_MEMBER_COMMAND_TOKEN`. Owns every mutation against the
 * `project_members` aggregate and the cross-cutting concerns that must
 * fire alongside a successful write:
 *
 *  1. Role-hierarchy enforcement (delegated to `IProjectMemberPolicy`
 *     so the rules can evolve — e.g., last-admin protection — without
 *     touching mutation code).
 *  2. Audit logging (fire-and-forget via the AuditLogs BullMQ queue).
 *  3. Event emission on the in-process `EventEmitter2` bus AFTER the DB
 *     write succeeds — never on failure (no phantom notifications).
 *
 * The method bodies are the Step 3 replacement for the legacy
 * `ProjectMembersService` god-class; the surface returns
 * `ProjectMemberSummary` DTOs so callers never accidentally bind to
 * TypeORM entity metadata.
 */
@Injectable()
export class ProjectMemberCommandService implements IProjectMemberCommand {
  private readonly logger = new Logger(ProjectMemberCommandService.name);

  constructor(
    private readonly repository: AbstractProjectMemberRepository,
    @Inject(PROJECT_MEMBER_POLICY_TOKEN)
    private readonly policy: IProjectMemberPolicy,
    private readonly auditLogsService: AuditLogsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cls: ClsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public command surface (IProjectMemberCommand)
  // ---------------------------------------------------------------------------

  async addMember(command: AddMemberCommand): Promise<ProjectMemberSummary> {
    const { projectId, userId, roleName, actorRole } = command;

    if (actorRole) {
      this.policy.assertCanManageRole(actorRole, roleName);
    }

    const existing = await this.repository.findOne(projectId, userId);

    if (existing) {
      if (existing.roleName === roleName) {
        throw new BadRequestException('User already a member of this project');
      }

      // Idempotent re-add with a different role → role change.
      const oldRole = existing.roleName;
      existing.roleName = roleName;
      const updated = await this.repository.save(existing);

      await this.emitAuditLog({
        action: 'MEMBER_ROLE_CHANGED',
        actionType: 'UPDATE',
        projectId,
        userId,
        metadata: { oldRole, newRole: roleName, via: 'addMember' },
      });
      this.emitMemberRoleChanged({
        projectId,
        userId,
        oldRole,
        newRole: roleName,
      });
      return this.toSummary(updated);
    }

    const pm = new ProjectMember();
    pm.projectId = projectId;
    pm.userId = userId;
    pm.roleName = roleName;
    const saved = await this.repository.save(pm);

    await this.emitAuditLog({
      action: 'MEMBER_ADDED',
      actionType: 'CREATE',
      projectId,
      userId,
      metadata: { roleName },
    });
    this.emitMemberAdded({ projectId, userId, roleName });

    return this.toSummary(saved);
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    const existing = await this.repository.findOne(projectId, userId);
    if (!existing) {
      throw new BadRequestException('User not a member of this project');
    }

    const roleName = existing.roleName;
    await this.repository.remove(existing);

    await this.emitAuditLog({
      action: 'MEMBER_REMOVED',
      actionType: 'DELETE',
      projectId,
      userId,
      metadata: { roleName },
    });
    this.emitMemberRemoved({ projectId, userId, roleName });
  }

  async updateMemberRole(
    command: UpdateMemberRoleCommand,
  ): Promise<ProjectMemberSummary> {
    const { projectId, userId, newRole, actorRole } = command;

    if (actorRole) {
      this.policy.assertCanManageRole(actorRole, newRole);
    }

    const existing = await this.repository.findOne(projectId, userId);
    if (!existing) {
      throw new BadRequestException('User not a member of this project');
    }
    if (existing.roleName === newRole) {
      throw new BadRequestException('User already has this role');
    }

    const oldRole = existing.roleName;
    existing.roleName = newRole;
    const updated = await this.repository.save(existing);

    await this.emitAuditLog({
      action: 'MEMBER_ROLE_CHANGED',
      actionType: 'UPDATE',
      projectId,
      userId,
      metadata: { oldRole, newRole },
    });
    this.emitMemberRoleChanged({ projectId, userId, oldRole, newRole });

    return this.toSummary(updated);
  }

  // ---------------------------------------------------------------------------
  // Private — DTO mapping
  // ---------------------------------------------------------------------------

  private toSummary(pm: ProjectMember): ProjectMemberSummary {
    return {
      projectId: pm.projectId,
      userId: pm.userId,
      roleName: pm.roleName,
      roleId: pm.roleId,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — Audit log emission
  // ---------------------------------------------------------------------------

  private async emitAuditLog(params: {
    action: string;
    actionType: 'CREATE' | 'UPDATE' | 'DELETE';
    projectId: string;
    userId: string;
    metadata: Record<string, string>;
  }): Promise<void> {
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: params.projectId,
      actor_id: this.getActorId(),
      resource_type: 'ProjectMember',
      resource_id: `${params.projectId}:${params.userId}`,
      action_type: params.actionType,
      action: params.action,
      metadata: {
        ...params.metadata,
        projectId: params.projectId,
        targetUserId: params.userId,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private — Domain event emission (post-write)
  // ---------------------------------------------------------------------------

  private emitMemberAdded(params: {
    projectId: string;
    userId: string;
    roleName: ProjectRole;
  }): void {
    const event: MemberAddedEvent = {
      projectId: params.projectId,
      userId: params.userId,
      roleName: params.roleName,
      actorId: this.getActorId(),
      timestamp: new Date(),
    };
    this.eventEmitter.emit(MEMBERSHIP_EVENTS.MEMBER_ADDED, event);
    this.logger.debug(
      `Event emitted: ${MEMBERSHIP_EVENTS.MEMBER_ADDED} — user ${params.userId} → project ${params.projectId}`,
    );
  }

  private emitMemberRemoved(params: {
    projectId: string;
    userId: string;
    roleName: ProjectRole;
  }): void {
    const event: MemberRemovedEvent = {
      projectId: params.projectId,
      userId: params.userId,
      roleName: params.roleName,
      actorId: this.getActorId(),
      timestamp: new Date(),
    };
    this.eventEmitter.emit(MEMBERSHIP_EVENTS.MEMBER_REMOVED, event);
    this.logger.debug(
      `Event emitted: ${MEMBERSHIP_EVENTS.MEMBER_REMOVED} — user ${params.userId} ← project ${params.projectId}`,
    );
  }

  private emitMemberRoleChanged(params: {
    projectId: string;
    userId: string;
    oldRole: ProjectRole;
    newRole: ProjectRole;
  }): void {
    const event: MemberRoleChangedEvent = {
      projectId: params.projectId,
      userId: params.userId,
      oldRole: params.oldRole,
      newRole: params.newRole,
      actorId: this.getActorId(),
      timestamp: new Date(),
    };
    this.eventEmitter.emit(MEMBERSHIP_EVENTS.MEMBER_ROLE_CHANGED, event);
    this.logger.debug(
      `Event emitted: ${MEMBERSHIP_EVENTS.MEMBER_ROLE_CHANGED} — user ${params.userId} ${params.oldRole} → ${params.newRole}`,
    );
  }

  private getActorId(): string {
    try {
      return this.cls.get('userId') || 'system';
    } catch {
      return 'system';
    }
  }
}
