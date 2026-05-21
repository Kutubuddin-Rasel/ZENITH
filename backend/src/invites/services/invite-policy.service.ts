import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { IInvitePolicy, InviteSummary } from '../interfaces/invites.interfaces';
import { InviteStatus } from '../enums/invite-status.enum';

/**
 * InvitePolicyService
 *
 * Pure, in-process implementation of `IInvitePolicy`. Centralises the
 * three orthogonal invite gating rules so every mutation path consults
 * a single decision surface instead of re-implementing the checks:
 *
 *   1. Ownership  — only the original inviter may revoke or resend.
 *                   Only the invitee may accept or reject.
 *   2. State      — every transitional mutation requires `Pending`.
 *   3. Expiration — `respondToInvite` rejects after `expiresAt`.
 *
 * Bound to `INVITE_POLICY_TOKEN` inside `InvitesModule`.
 *
 * Method shape rationale
 * ----------------------
 * Each `assert*` throws (`ForbiddenException` for ownership,
 * `BadRequestException` for state/expiration) rather than returning a
 * boolean, so callers do not have to branch on the result. The error
 * messages preserve the legacy `InvitesService` strings verbatim to
 * keep the HTTP surface binary-compatible.
 *
 * Why split `assertCanRevoke` from `assertCanResend`
 * --------------------------------------------------
 * Today both rules collapse to `actorId === invite.inviterId`. They are
 * kept as distinct methods so a future divergence (e.g., allowing
 * project leads to resend on behalf of the inviter) only touches one
 * call site without leaking semantic intent at the consumer.
 */
@Injectable()
export class InvitePolicyService implements IInvitePolicy {
  assertCanRevoke(invite: InviteSummary, actorId: string): void {
    if (invite.inviterId !== actorId) {
      throw new ForbiddenException(
        'You do not have permission to revoke this invite.',
      );
    }
  }

  assertCanResend(invite: InviteSummary, actorId: string): void {
    if (invite.inviterId !== actorId) {
      throw new ForbiddenException(
        'You do not have permission to resend this invite.',
      );
    }
  }

  assertCanRespond(invite: InviteSummary, actorId: string): void {
    if (invite.inviteeId !== actorId) {
      throw new ForbiddenException('Not your invite');
    }
  }

  assertPending(invite: InviteSummary): void {
    if (invite.status !== InviteStatus.Pending) {
      throw new BadRequestException('Invite already responded');
    }
  }

  assertNotExpired(invite: InviteSummary): void {
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }
  }
}
