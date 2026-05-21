import { Injectable } from '@nestjs/common';
import { AbstractInviteRepository } from '../repositories/abstract/invite.repository.abstract';
import { Invite } from '../entities/invite.entity';
import {
  IInviteQuery,
  InviteSummary,
  InviteUserRef,
  InviteWithRelations,
} from '../interfaces/invites.interfaces';

/**
 * InviteQueryService
 *
 * Read-only implementation of `IInviteQuery`. Bound to
 * `INVITE_QUERY_TOKEN` inside `InvitesModule` so every external read
 * path (registration flow, project dashboards) consumes invites through
 * this ISP-segregated surface instead of touching the TypeORM repository
 * or the (deleted) `InvitesService` god-class.
 *
 * DTO Mapping
 * -----------
 * The repository returns the `Invite` entity (the canonical aggregate
 * shape inside the module). This service maps to pure value-object
 * DTOs so consumers never accidentally depend on ORM metadata, lazy
 * relations, or the cross-aggregate `User` references embedded in
 * `Invite.invitee` / `Invite.inviter`.
 *
 * The `InviteWithRelations` projection narrows the joined `User`
 * records to `{ id, name, email }` (`InviteUserRef`) — sensitive auth
 * fields (password hash, refresh token, MFA secret, etc.) are
 * intentionally absent at the boundary.
 */
@Injectable()
export class InviteQueryService implements IInviteQuery {
  constructor(private readonly repository: AbstractInviteRepository) {}

  async findOneByToken(token: string): Promise<InviteWithRelations | null> {
    const invite = await this.repository.findByToken(token);
    if (!invite) return null;
    return this.toRelations(invite);
  }

  async findForProject(
    projectId: string,
  ): Promise<readonly InviteWithRelations[]> {
    const invites = await this.repository.findForProject(projectId);
    return invites.map((i) => this.toRelations(i));
  }

  async findActivePendingByUser(
    projectId: string,
    inviteeId: string,
  ): Promise<InviteSummary | null> {
    const invite = await this.repository.findActivePending(projectId, {
      inviteeId,
    });
    return invite ? this.toSummary(invite) : null;
  }

  async findActivePendingByEmail(
    projectId: string,
    inviteeEmail: string,
  ): Promise<InviteSummary | null> {
    const invite = await this.repository.findActivePending(projectId, {
      inviteeEmail,
    });
    return invite ? this.toSummary(invite) : null;
  }

  // ---------------------------------------------------------------------------
  // Private — DTO mapping (entity → value-object views)
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

  private toRelations(invite: Invite): InviteWithRelations {
    return {
      ...this.toSummary(invite),
      invitee: invite.invitee ? this.toUserRef(invite.invitee) : null,
      // `inviter` is non-nullable in the schema; the cast guards against
      // a repository call site that forgot to eager-load the relation.
      inviter: invite.inviter
        ? this.toUserRef(invite.inviter)
        : { id: invite.inviterId, name: '', email: '' },
    };
  }

  private toUserRef(user: {
    id: string;
    name: string;
    email: string;
  }): InviteUserRef {
    return { id: user.id, name: user.name, email: user.email };
  }
}
