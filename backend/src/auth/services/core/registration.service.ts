import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';

import { UsersService } from '../../../users/users.service';
import {
  INVITE_COMMAND_TOKEN,
  INVITE_QUERY_TOKEN,
} from '../../../invites/constants/invites.tokens';
import type {
  IInviteCommand,
  IInviteQuery,
} from '../../../invites/interfaces/invites.interfaces';
import { InviteStatus } from '../../../invites/enums/invite-status.enum';
import { OnboardingService } from '../../../onboarding/services/onboarding.service';
import { IOrganizationWriter } from '../../../organizations/interfaces/organization.interfaces';
import { ORG_WRITER_TOKEN } from '../../../organizations/constants/organization.tokens';
import { PasswordService } from '../password.service';
import { PasswordPolicyService } from '../password-policy.service';
import { PasswordBreachService } from '../password-breach.service';
import { RegisterDto } from '../../dto/register.dto';
import { RedeemInviteDto } from '../../dto/redeem-invite.dto';
import { SafeUser } from '../../types/safe-user.interface';
import { LoginCoordinator } from './login-coordinator.service';

// Argon2id corresponds to passwordVersion = 3 on the User entity.
const ARGON2ID_VERSION = 3;
// OWASP: 32 random bytes = 256-bit entropy for email-verification tokens.
const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Step 3 — Registration & invite-redemption flows extracted from the
 * legacy `AuthService`.
 *
 * Responsibilities:
 *   - Local-credential sign-up with NIST-aligned password validation,
 *     HIBP breach check, Argon2id hashing, and optional workspace creation.
 *   - Invite redemption (delegates final token issuance to
 *     {@link LoginCoordinator.login}).
 *   - Read-side user lookup for the 2FA / `/me` flows.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly usersService: UsersService,
    @Inject(INVITE_QUERY_TOKEN)
    private readonly inviteQuery: IInviteQuery,
    @Inject(INVITE_COMMAND_TOKEN)
    private readonly inviteCommand: IInviteCommand,
    private readonly passwordService: PasswordService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly passwordBreachService: PasswordBreachService,
    private readonly onboardingService: OnboardingService,
    @Inject(ORG_WRITER_TOKEN)
    private readonly orgWriter: IOrganizationWriter,
    private readonly loginCoordinator: LoginCoordinator,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.usersService.findOneByEmail(
      dto.email.toLowerCase(),
    );
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    // Layer 1 — NIST 800-63B + zxcvbn entropy policy.
    const policyResult = this.passwordPolicyService.validate(dto.password, [
      dto.email,
      dto.name,
    ]);
    if (!policyResult.isAcceptable) {
      throw new BadRequestException(policyResult.feedback.join(' '));
    }

    // Layer 2 — HIBP k-anonymity breach check.
    const breachCheck = await this.passwordBreachService.checkPassword(
      dto.password,
    );
    if (breachCheck.isBreached) {
      throw new BadRequestException(
        this.passwordBreachService.getBreachMessage(breachCheck.breachCount),
      );
    }

    // Layer 3 — Argon2id hash.
    const hash = await this.passwordService.hash(dto.password);

    const emailVerificationToken = randomBytes(
      EMAIL_VERIFICATION_TOKEN_BYTES,
    ).toString('hex');
    const emailVerificationExpiry = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_MS,
    );

    let organizationId: string | undefined;
    let isSuperAdmin = false;

    if (dto.workspaceName) {
      const organization = await this.orgWriter.create({
        name: dto.workspaceName,
      });
      organizationId = organization.id;
      isSuperAdmin = true; // First user of a workspace is its Super Admin.
    }

    const user = await this.usersService.create(
      dto.email.toLowerCase(),
      hash,
      dto.name,
      isSuperAdmin,
      organizationId,
      undefined,
      ARGON2ID_VERSION,
      emailVerificationToken,
      emailVerificationExpiry,
    );

    await this.onboardingService.initializeOnboarding(user.id);

    // TODO: dispatch verification email via EmailService.

    return user;
  }

  async redeemInvite(dto: RedeemInviteDto): Promise<{
    access_token: string;
    refresh_token: string;
    user: {
      id: string;
      email: string;
      name: string;
      isSuperAdmin: boolean;
      organizationId?: string;
    };
  }> {
    const invite = await this.inviteQuery.findOneByToken(dto.token);
    if (
      !invite ||
      invite.status !== InviteStatus.Pending ||
      (invite.expiresAt && invite.expiresAt < new Date())
    ) {
      throw new BadRequestException('Invite is invalid or has expired.');
    }

    if (!invite.inviteeId) {
      throw new BadRequestException(
        'This invite has no linked user. The invitee must register first.',
      );
    }

    const user = await this.usersService.findOneById(invite.inviteeId);
    if (!user) {
      throw new Error('Invitee user does not exist. Cannot redeem invite.');
    }

    await this.inviteCommand.respondToInvite({
      inviteId: invite.id,
      userId: user.id,
      accept: true,
    });

    const { passwordHash: _hash, hashedRefreshToken: _rt, ...safeUser } = user;
    return this.loginCoordinator.login(safeUser as SafeUser);
  }

  async findUserById(userId: string): Promise<SafeUser> {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { passwordHash: _hash, hashedRefreshToken: _rt, ...safeUser } = user;
    return safeUser as SafeUser;
  }
}
