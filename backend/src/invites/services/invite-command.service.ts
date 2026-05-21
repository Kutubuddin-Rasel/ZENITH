import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AbstractInviteRepository } from '../repositories/abstract/invite.repository.abstract';
import type { BulkInviteRepoEntry } from '../repositories/abstract/invite.repository.abstract';
import { Invite } from '../entities/invite.entity';
import { InviteStatus } from '../enums/invite-status.enum';
import {
  BulkInviteCommand,
  BulkInviteResult,
  IInviteCommand,
  IInvitePolicy,
  IInviteTokenGenerator,
  InviteCreateCommand,
  InviteResponseCommand,
  InviteSummary,
  InviteUserRef,
} from '../interfaces/invites.interfaces';
import {
  INVITE_POLICY_TOKEN,
  INVITE_TOKEN_GENERATOR_TOKEN,
} from '../constants/invites.tokens';
import {
  INVITES_EVENTS,
  InviteBulkCreatedEvent,
  InviteCreatedEvent,
  InviteRespondedEvent,
  ProjectSummary,
} from '../events/invites-events';
import { ProjectLookupPort } from '../ports/project-lookup.port';
import {
  PROJECT_MEMBER_COMMAND_TOKEN,
  IProjectMemberCommand,
} from '../../membership';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { USER_PROFILE_READER, type IUserProfileReader } from '../../users';

/**
 * InviteCommandService
 *
 * Write-side implementation of `IInviteCommand`. Bound to
 * `INVITE_COMMAND_TOKEN`. Owns every mutation against the `invites`
 * aggregate and the cross-cutting concerns that must fire alongside a
 * successful write:
 *
 *   1. Ownership / state-machine / expiration enforcement, delegated
 *      to `IInvitePolicy` so the rules evolve independently of the
 *      mutation flow.
 *   2. Token generation, delegated to `IInviteTokenGenerator` so
 *      deterministic tests can swap a stub against
 *      `INVITE_TOKEN_GENERATOR_TOKEN`.
 *   3. Membership creation on accept, delegated to the membership
 *      module's `IProjectMemberCommand` (`PROJECT_MEMBER_COMMAND_TOKEN`)
 *      — the invites module never writes to `project_members`.
 *   4. User resolution via the segregated `IUserProfileReader`
 *      (`USER_PROFILE_READER`) — concrete `UsersService` injection is
 *      forbidden.
 *   5. Project hydration via the outbound `ProjectLookupPort`, whose
 *      adapter lives inside `ProjectsModule` (`ProjectLookupAdapter`)
 *      — this breaks the historic `InvitesModule ↔ ProjectsModule`
 *      `forwardRef` cycle.
 *   6. Event emission on the in-process `EventEmitter2` bus AFTER the
 *      DB write succeeds — never on failure (no phantom notifications).
 *      Payloads are pure DTOs (`InviteSummary` + `ProjectSummary`),
 *      not TypeORM entities.
 *
 * The method bodies are the Step 3 replacement for the legacy
 * `InvitesService` god-class; the surface returns `InviteSummary` DTOs
 * so callers never accidentally bind to TypeORM entity metadata.
 */
@Injectable()
export class InviteCommandService implements IInviteCommand {
  private readonly logger = new Logger(InviteCommandService.name);

  constructor(
    private readonly repository: AbstractInviteRepository,
    @Inject(INVITE_POLICY_TOKEN)
    private readonly policy: IInvitePolicy,
    @Inject(INVITE_TOKEN_GENERATOR_TOKEN)
    private readonly tokenGenerator: IInviteTokenGenerator,
    @Inject(PROJECT_MEMBER_COMMAND_TOKEN)
    private readonly memberCommand: IProjectMemberCommand,
    @Inject(USER_PROFILE_READER)
    private readonly userReader: IUserProfileReader,
    private readonly projectLookup: ProjectLookupPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Public command surface (IInviteCommand)
  // ---------------------------------------------------------------------------

  async createInvite(command: InviteCreateCommand): Promise<InviteSummary> {
    const { projectId, inviteeId, email, inviterId, role, expiresInHours } =
      command;

    if (!inviteeId && !email) {
      throw new BadRequestException(
        'Either inviteeId or email must be provided',
      );
    }

    const { resolvedInviteeId, resolvedInviteeEmail } =
      await this.resolveInviteeTarget({ inviteeId, email });

    await this.assertNoActiveDuplicate(
      projectId,
      resolvedInviteeId,
      resolvedInviteeEmail,
    );

    const created = this.repository.createEntity({
      token: this.tokenGenerator.generate(),
      projectId,
      inviteeId: resolvedInviteeId,
      inviteeEmail: resolvedInviteeEmail,
      inviterId,
      role,
      status: InviteStatus.Pending,
      expiresAt: this.computeExpiry(expiresInHours),
    });
    const saved = await this.repository.save(created);
    const summary = this.toSummary(saved);

    await this.emitBaseEvent(INVITES_EVENTS.CREATED, summary);

    return summary;
  }

  async revokeInvite(
    inviteId: string,
    actorId: string,
  ): Promise<InviteSummary> {
    const invite = await this.requireInvite(inviteId);
    const snapshot = this.toSummary(invite);

    this.policy.assertCanRevoke(snapshot, actorId);
    this.policy.assertPending(snapshot);

    invite.status = InviteStatus.Revoked;
    const updated = await this.repository.save(invite);
    const summary = this.toSummary(updated);

    await this.emitBaseEvent(INVITES_EVENTS.REVOKED, summary);

    return summary;
  }

  async resendInvite(inviteId: string, actorId: string): Promise<void> {
    const invite = await this.requireInvite(inviteId);
    const summary = this.toSummary(invite);

    this.policy.assertCanResend(summary, actorId);
    this.policy.assertPending(summary);

    await this.emitBaseEvent(INVITES_EVENTS.RESEND, summary);
  }

  async respondToInvite(
    command: InviteResponseCommand,
  ): Promise<InviteSummary> {
    const { inviteId, userId, accept, reason } = command;

    const invite = await this.requireInvite(inviteId);
    const snapshot = this.toSummary(invite);

    this.policy.assertCanRespond(snapshot, userId);
    this.policy.assertPending(snapshot);

    // CRITICAL: expiration MUST be checked before any state transition.
    // If expired, flip persisted status to `Expired` and throw — the
    // throw aborts the accept path so no membership row is created.
    if (snapshot.expiresAt && snapshot.expiresAt < new Date()) {
      invite.status = InviteStatus.Expired;
      await this.repository.save(invite);
      throw new BadRequestException('Invite has expired');
    }

    invite.status = accept ? InviteStatus.Accepted : InviteStatus.Rejected;
    invite.respondedAt = new Date();
    invite.reason = reason;
    const updated = await this.repository.save(invite);
    const summary = this.toSummary(updated);

    if (accept) {
      await this.memberCommand.addMember({
        projectId: invite.projectId,
        userId,
        roleName: invite.role as ProjectRole,
      });
    }

    const inviteeRef = await this.resolveInviteeRef(userId);
    await this.emitRespondedEvent(summary, accept, inviteeRef, reason);

    return summary;
  }

  private async resolveInviteeRef(
    userId: string,
  ): Promise<InviteUserRef | null> {
    try {
      const user = await this.userReader.findOneById(userId);
      return user ? { id: user.id, name: user.name, email: user.email } : null;
    } catch {
      // userReader throws on not-found in some implementations; degrade
      // gracefully so the notification still fires with id-only context.
      return null;
    }
  }

  async bulkInvite(command: BulkInviteCommand): Promise<BulkInviteResult> {
    const { projectId, inviterId, entries } = command;

    const resolved: BulkInviteRepoEntry[] = [];
    const preFailed: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.inviteeId && !entry.email) {
        preFailed.push({
          index: i,
          reason: 'Either inviteeId or email must be provided',
        });
        continue;
      }

      const { resolvedInviteeId, resolvedInviteeEmail } =
        await this.resolveInviteeTarget(entry);

      resolved.push({
        index: i,
        inviteeId: resolvedInviteeId,
        inviteeEmail: resolvedInviteeEmail,
        role: entry.role,
        token: this.tokenGenerator.generate(),
        expiresAt: this.computeExpiry(entry.expiresInHours),
      });
    }

    const repoResult = await this.repository.bulkCreateInTransaction(
      projectId,
      inviterId,
      resolved,
    );

    const failed = [...preFailed, ...repoResult.failed].sort(
      (a, b) => a.index - b.index,
    );
    const created = repoResult.created.map((i) => this.toSummary(i));

    if (created.length > 0) {
      await this.emitBulkCreatedEvent(projectId, inviterId, created);
    }

    return { created, failed };
  }

  // ---------------------------------------------------------------------------
  // Private — invite + target resolution helpers
  // ---------------------------------------------------------------------------

  private async requireInvite(inviteId: string): Promise<Invite> {
    const invite = await this.repository.findById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  private async resolveInviteeTarget(target: {
    inviteeId?: string;
    email?: string;
  }): Promise<{
    resolvedInviteeId: string | null;
    resolvedInviteeEmail: string | null;
  }> {
    if (target.inviteeId) {
      return {
        resolvedInviteeId: target.inviteeId,
        resolvedInviteeEmail: null,
      };
    }
    if (target.email) {
      const user = await this.userReader.findOneByEmail(target.email);
      return user
        ? { resolvedInviteeId: user.id, resolvedInviteeEmail: null }
        : { resolvedInviteeId: null, resolvedInviteeEmail: target.email };
    }
    // Caller (`createInvite`) is responsible for guarding the `neither`
    // case BEFORE invoking this helper; bulk callers collect the same
    // condition into their `preFailed[]` list.
    return { resolvedInviteeId: null, resolvedInviteeEmail: null };
  }

  private async assertNoActiveDuplicate(
    projectId: string,
    resolvedInviteeId: string | null,
    resolvedInviteeEmail: string | null,
  ): Promise<void> {
    if (resolvedInviteeId) {
      const existing = await this.repository.findActivePending(projectId, {
        inviteeId: resolvedInviteeId,
      });
      if (existing) {
        throw new BadRequestException(
          'Active invite already exists for this user/project',
        );
      }
      return;
    }
    if (resolvedInviteeEmail) {
      const existing = await this.repository.findActivePending(projectId, {
        inviteeEmail: resolvedInviteeEmail,
      });
      if (existing) {
        throw new BadRequestException(
          'Active invite already exists for this email/project',
        );
      }
    }
  }

  private computeExpiry(expiresInHours?: number): Date | undefined {
    return expiresInHours
      ? new Date(Date.now() + expiresInHours * 3600 * 1000)
      : undefined;
  }

  // ---------------------------------------------------------------------------
  // Private — DTO mapping
  // ---------------------------------------------------------------------------

  private toSummary(invite: Invite): InviteSummary {
    return {
      id: invite.id,
      token: invite.token,
      projectId: invite.projectId,
      inviteeId: invite.inviteeId,
      inviteeEmail: invite.inviteeEmail,
      inviterId: invite.inviterId,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt ?? null,
      respondedAt: invite.respondedAt ?? null,
      reason: invite.reason ?? null,
      createdAt: invite.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Private — event emission
  // ---------------------------------------------------------------------------

  /**
   * Resolve a project to its summary projection. If the project is
   * missing (e.g., deleted between the guard check and the event
   * dispatch) we fall back to an `{ id, name: '' }` stub — emitting
   * the event with a partial payload is preferable to losing the
   * downstream side-effects (notification cleanup, audit feed).
   */
  private async resolveProjectSummary(
    projectId: string,
  ): Promise<ProjectSummary> {
    const view = await this.projectLookup.findProjectSummary(projectId);
    return view ?? { id: projectId, name: '' };
  }

  private async emitBaseEvent(
    name:
      | typeof INVITES_EVENTS.CREATED
      | typeof INVITES_EVENTS.REVOKED
      | typeof INVITES_EVENTS.RESEND,
    invite: InviteSummary,
  ): Promise<void> {
    const project = await this.resolveProjectSummary(invite.projectId);
    const event: InviteCreatedEvent = {
      invite,
      project,
      timestamp: new Date(),
    };
    this.eventEmitter.emit(name, event);
    this.logger.debug(`Event emitted: ${name} — invite ${invite.id}`);
  }

  private async emitRespondedEvent(
    invite: InviteSummary,
    accept: boolean,
    invitee: InviteUserRef | null,
    reason?: string,
  ): Promise<void> {
    const project = await this.resolveProjectSummary(invite.projectId);
    const event: InviteRespondedEvent = {
      invite,
      project,
      timestamp: new Date(),
      accept,
      reason,
      invitee,
    };
    this.eventEmitter.emit(INVITES_EVENTS.RESPONDED, event);
    this.logger.debug(
      `Event emitted: ${INVITES_EVENTS.RESPONDED} — invite ${invite.id} accept=${accept}`,
    );
  }

  private async emitBulkCreatedEvent(
    projectId: string,
    inviterId: string,
    created: readonly InviteSummary[],
  ): Promise<void> {
    const project = await this.resolveProjectSummary(projectId);
    const event: InviteBulkCreatedEvent = {
      project,
      inviterId,
      created,
      timestamp: new Date(),
    };
    this.eventEmitter.emit(INVITES_EVENTS.BULK_CREATED, event);
    this.logger.debug(
      `Event emitted: ${INVITES_EVENTS.BULK_CREATED} — ${created.length} invites in project ${projectId}`,
    );
  }
}
