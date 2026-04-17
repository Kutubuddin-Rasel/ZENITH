/**
 * ProjectMembersService — Domain Service for Project Membership Management
 *
 * RESPONSIBILITIES:
 *   1. CRUD operations for project-member relationships (composite PK)
 *   2. Audit logging on all state-changing operations
 *   3. Event emission for downstream consumers (notifications, activity feeds)
 *   4. Role hierarchy enforcement (privilege escalation prevention)
 *
 * DUAL ROLE MIGRATION:
 * This service operates on `roleName` (legacy enum). The `roleId` (FK to Role entity)
 * is NOT managed here — it's populated by the RBAC migration pipeline.
 * Both fields coexist on the ProjectMember entity until the migration completes.
 *
 * TRANSACTIONAL BOUNDARIES:
 * Events are emitted AFTER the DB save/remove succeeds.
 * If the DB write fails, no events are emitted (no phantom notifications).
 * Audit logging is fire-and-forget via BullMQ (non-blocking).
 *
 * @see ProjectMember entity for the composite primary key design
 * @see role-hierarchy.ts for the role weight map
 * @see events/membership-events.ts for event payload contracts
 */

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import { ProjectMember } from '../entities/project-member.entity';
import { ProjectRole } from '../enums/project-role.enum';
import { AuditLogsService } from '../../audit/audit-logs.service';
import { canManageRole } from '../role-hierarchy';
import {
  MEMBERSHIP_EVENTS,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleChangedEvent,
} from '../events/membership-events';

// =============================================================================
// TYPES
// =============================================================================

/** Parameters for adding a member to a project */
interface AddMemberParams {
  readonly projectId: string;
  readonly userId: string;
  readonly roleName: ProjectRole;
}

/** Return shape for listMembershipsForUser() */
interface UserMembership {
  readonly projectId: string;
  readonly roleName: ProjectRole;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class ProjectMembersService {
  private readonly logger = new Logger(ProjectMembersService.name);

  constructor(
    @InjectRepository(ProjectMember)
    private readonly pmRepo: Repository<ProjectMember>,
    private readonly auditLogsService: AuditLogsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cls: ClsService,
  ) {}

  // ===========================================================================
  // MUTATIONS
  // ===========================================================================

  /**
   * Add a user to a project with a specific role.
   *
   * BEHAVIOR:
   * - If user is NOT a member → creates new membership, emits member.added
   * - If user IS a member with DIFFERENT role → updates role, emits member.role_changed
   * - If user IS a member with SAME role → throws BadRequestException
   *
   * ROLE HIERARCHY:
   * The actor's role must be >= the target role. A Developer cannot
   * assign someone as ProjectLead (privilege escalation prevention).
   *
   * @param params - projectId, userId, roleName
   * @param actorRole - Optional: role of the user performing the action (for hierarchy check)
   * @returns The created or updated ProjectMember
   */
  async addMemberToProject(
    params: AddMemberParams,
    actorRole?: ProjectRole,
  ): Promise<ProjectMember> {
    const { projectId, userId, roleName } = params;

    // Role hierarchy enforcement (when actor context is available)
    if (actorRole && !canManageRole(actorRole, roleName)) {
      throw new ForbiddenException(
        `Cannot assign role '${roleName}' — your role '${actorRole}' does not have sufficient authority`,
      );
    }

    const existing = await this.pmRepo.findOneBy({ projectId, userId });

    if (existing) {
      if (existing.roleName !== roleName) {
        // === ROLE CHANGE on existing member ===
        const oldRole = existing.roleName;
        existing.roleName = roleName;
        const updated = await this.pmRepo.save(existing);

        // Audit: MEMBER_ROLE_CHANGED (via add path)
        await this.emitAuditLog({
          action: 'MEMBER_ROLE_CHANGED',
          actionType: 'UPDATE',
          projectId,
          userId,
          metadata: { oldRole, newRole: roleName, via: 'addMemberToProject' },
        });

        // Event: member.role_changed
        this.emitMemberRoleChanged({ projectId, userId, oldRole, newRole: roleName });

        return updated;
      }
      throw new BadRequestException('User already a member of this project');
    }

    // === NEW MEMBER ===
    const pm = new ProjectMember();
    pm.projectId = projectId;
    pm.userId = userId;
    pm.roleName = roleName;
    const saved = await this.pmRepo.save(pm);

    // Audit: MEMBER_ADDED
    await this.emitAuditLog({
      action: 'MEMBER_ADDED',
      actionType: 'CREATE',
      projectId,
      userId,
      metadata: { roleName },
    });

    // Event: member.added
    this.emitMemberAdded({ projectId, userId, roleName });

    return saved;
  }

  /**
   * Remove a member from a project.
   *
   * Captures the member's role BEFORE deletion for audit/event context.
   *
   * @param projectId - The project to remove the member from
   * @param userId - The user to remove
   */
  async removeMemberFromProject(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.pmRepo.findOneBy({ projectId, userId });
    if (!existing) {
      throw new BadRequestException('User not a member of this project');
    }

    // Capture role BEFORE deletion (for audit and event context)
    const roleName = existing.roleName;

    await this.pmRepo.remove(existing);

    // Audit: MEMBER_REMOVED
    await this.emitAuditLog({
      action: 'MEMBER_REMOVED',
      actionType: 'DELETE',
      projectId,
      userId,
      metadata: { roleName },
    });

    // Event: member.removed
    this.emitMemberRemoved({ projectId, userId, roleName });
  }

  /**
   * Update a member's role in a project.
   *
   * ROLE HIERARCHY:
   * When actorRole is provided, the actor can only assign roles
   * at or below their own level.
   *
   * @param projectId - The project
   * @param userId - The user whose role is changing
   * @param newRole - The new role to assign
   * @param actorRole - Optional: role of the acting user (for hierarchy check)
   * @returns Updated ProjectMember
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    newRole: ProjectRole,
    actorRole?: ProjectRole,
  ): Promise<ProjectMember> {
    // Role hierarchy enforcement
    if (actorRole && !canManageRole(actorRole, newRole)) {
      throw new ForbiddenException(
        `Cannot assign role '${newRole}' — your role '${actorRole}' does not have sufficient authority`,
      );
    }

    const existing = await this.pmRepo.findOneBy({ projectId, userId });
    if (!existing) {
      throw new BadRequestException('User not a member of this project');
    }
    if (existing.roleName === newRole) {
      throw new BadRequestException('User already has this role');
    }

    const oldRole = existing.roleName;
    existing.roleName = newRole;
    const updated = await this.pmRepo.save(existing);

    // Audit: MEMBER_ROLE_CHANGED
    await this.emitAuditLog({
      action: 'MEMBER_ROLE_CHANGED',
      actionType: 'UPDATE',
      projectId,
      userId,
      metadata: { oldRole, newRole },
    });

    // Event: member.role_changed
    this.emitMemberRoleChanged({ projectId, userId, oldRole, newRole });

    return updated;
  }

  // ===========================================================================
  // QUERIES (Read-only — no audit, no events)
  // ===========================================================================

  /**
   * List all members of a project with user details.
   *
   * PERFORMANCE: Uses QueryBuilder with explicit select to avoid
   * fetching unnecessary user fields (password, tokens, etc.)
   */
  async listMembers(projectId: string): Promise<ProjectMember[]> {
    return this.pmRepo
      .createQueryBuilder('pm')
      .leftJoinAndSelect('pm.user', 'user')
      .where('pm.projectId = :projectId', { projectId })
      .select([
        'pm.userId',
        'pm.roleName',
        'user.id',
        'user.name',
        'user.email',
        'user.defaultRole',
      ])
      .getMany();
  }

  /** Get the user's roleName in a project, or null if not a member */
  async getUserRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const pm = await this.pmRepo.findOneBy({ projectId, userId });
    return pm ? pm.roleName : null;
  }

  /**
   * Get both roleId and roleName for a project member.
   * Used by PermissionsGuard for database-backed RBAC.
   */
  async getMemberRoleDetails(
    projectId: string,
    userId: string,
  ): Promise<{ roleId: string | null; roleName: ProjectRole } | null> {
    const pm = await this.pmRepo.findOneBy({ projectId, userId });
    if (!pm) return null;
    return { roleId: pm.roleId, roleName: pm.roleName };
  }

  /**
   * List all project memberships for a user.
   * Used for user-centric views (e.g., "My Projects" dashboard).
   */
  async listMembershipsForUser(userId: string): Promise<UserMembership[]> {
    return this.pmRepo.find({
      where: { userId },
      select: ['projectId', 'roleName'],
    });
  }

  // ===========================================================================
  // PRIVATE: Audit Logging
  // ===========================================================================

  /**
   * Fire-and-forget audit log via BullMQ.
   * Non-blocking — never throws. Failures are logged and retried by the queue.
   */
  private async emitAuditLog(params: {
    action: string;
    actionType: 'CREATE' | 'UPDATE' | 'DELETE';
    projectId: string;
    userId: string;
    metadata: Record<string, string>;
  }): Promise<void> {
    const actorId = this.getActorId();

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: params.projectId,
      actor_id: actorId,
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

  // ===========================================================================
  // PRIVATE: Event Emission
  // ===========================================================================

  /**
   * Emit member.added event.
   * Emitted AFTER DB save to prevent phantom notifications.
   */
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

  /**
   * Emit member.removed event.
   * Includes the role the member had before removal for notification context.
   */
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

  /**
   * Emit member.role_changed event.
   * Carries both old and new roles for diff-aware notifications.
   */
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

  // ===========================================================================
  // PRIVATE: Helpers
  // ===========================================================================

  /**
   * Extract the actor ID from the CLS request context.
   * Falls back to 'system' for non-HTTP contexts (cron jobs, CLI, etc.)
   */
  private getActorId(): string {
    try {
      return (this.cls.get('userId') as string) || 'system';
    } catch {
      return 'system';
    }
  }
}
