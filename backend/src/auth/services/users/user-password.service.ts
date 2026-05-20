import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import * as argon2 from 'argon2';

import { ChangePasswordDto } from '../../../users/dto/create-user.dto';
import { UserRepository } from '../../../database/repositories/user.repository';
import { AuditLogsService } from '../../../audit/audit-logs.service';
import { PasswordPolicyService } from '../password-policy.service';
import { PasswordBreachService } from '../password-breach.service';
import { SessionsService } from '../../sessions.service';
import {
  PASSWORD_CHANGED_EVENT,
  PasswordChangedEvent,
} from '../../../core/events/payloads/password-changed.event';

/**
 * Result of a password rotation — mirrors the original users-side contract so
 * the HTTP layer can return it verbatim.
 */
export interface ChangePasswordResult {
  readonly success: true;
  readonly revokedSessions: number;
}

/**
 * Auth-domain owner of the password rotation pipeline.
 *
 * Composes the three Layer-1 safeties (policy → breach → Argon2id) with
 * session revocation, audit logging and a `PASSWORD_CHANGED_EVENT` emission.
 * This service is the ONLY place in the codebase permitted to mutate
 * `User.passwordHash` / `User.passwordVersion`.
 */
@Injectable()
export class UserPasswordService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly passwordBreachService: PasswordBreachService,
    private readonly sessionsService: SessionsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Rotate a user's password.
   *
   * Authorisation (self-or-super-admin) is enforced upstream by the controller
   * — this service trusts its caller and focuses purely on the cryptographic
   * lifecycle.
   *
   * @param userId             - Target user UUID.
   * @param dto                - DTO carrying current/new/confirmation passwords.
   * @param isSuperAdmin       - When true, `currentPassword` is not required.
   * @param currentSessionId   - When provided, preserves this session across
   *                             the rotation; otherwise every session is
   *                             revoked.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    isSuperAdmin: boolean,
    currentSessionId?: string,
  ): Promise<ChangePasswordResult> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Non-admins must prove ownership of the existing credential.
    if (!isSuperAdmin) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password required');
      }
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!valid) {
        throw new ForbiddenException('Current password is incorrect');
      }
    }

    // Layer 1: NIST 800-63B + zxcvbn entropy gate.
    const policyResult = this.passwordPolicyService.validate(dto.newPassword, [
      user.email,
      user.name,
    ]);
    if (!policyResult.isAcceptable) {
      throw new BadRequestException(policyResult.feedback.join(' '));
    }
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    // Layer 2: HIBP breach check (fail-open via PasswordBreachService).
    const breachCheck = await this.passwordBreachService.checkPassword(
      dto.newPassword,
    );
    if (breachCheck.isBreached) {
      throw new BadRequestException(
        this.passwordBreachService.getBreachMessage(breachCheck.breachCount),
      );
    }

    // Layer 3: Argon2id hash + monotonic password version bump.
    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    user.passwordVersion = (user.passwordVersion || 1) + 1;
    await this.userRepo.save(user);

    // Synchronous session revocation — never deferred to the listener because
    // active credentials must die before the response returns.
    const revokedSessions = currentSessionId
      ? await this.sessionsService.revokeAllExceptCurrent(
          userId,
          currentSessionId,
        )
      : await this.sessionsService.revokeAllSessions(userId);

    const requestId = this.cls.get<string>('requestId') ?? null;

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: user.organizationId || 'unknown',
      actor_id: userId,
      resource_type: 'User',
      resource_id: userId,
      action_type: 'UPDATE',
      action: 'PASSWORD_CHANGE',
      metadata: {
        severity: 'HIGH',
        newPasswordVersion: user.passwordVersion,
        revokedSessions,
        preservedCurrentSession: !!currentSessionId,
        requestId,
      },
    });

    const event: PasswordChangedEvent = {
      userId,
      newPasswordVersion: user.passwordVersion,
      revokedSessions,
      preservedCurrentSessionId: currentSessionId ?? null,
      changedAt: new Date(),
      requestId,
    };
    this.eventEmitter.emit(PASSWORD_CHANGED_EVENT, event);

    return { success: true, revokedSessions };
  }
}
