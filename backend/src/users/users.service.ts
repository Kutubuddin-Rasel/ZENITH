import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import * as argon2 from 'argon2';
import { ChangePasswordDto } from './dto/create-user.dto';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import { SessionsService } from '../auth/sessions.service';
import { PasswordBreachService } from '../auth/services/password-breach.service';
import { PasswordPolicyService } from '../auth/services/password-policy.service';

// SOLID Refactor (Step 3): Depend on the abstract User repository token (DIP).
import { UserRepository } from '../database/repositories/user.repository';
import {
  UserSearchRow,
  UserWithMemberships,
} from '../database/interfaces/repository.interfaces';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
    @Inject(forwardRef(() => PasswordBreachService))
    private readonly passwordBreachService: PasswordBreachService,
    @Inject(forwardRef(() => PasswordPolicyService))
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  /** Create a new user */
  async create(
    email: string,
    passwordHash: string,
    name: string,
    isSuperAdmin?: boolean,
    organizationId?: string,
    defaultRole?: string,
    passwordVersion: number = 1,
    emailVerificationToken: string | null = null,
    emailVerificationExpiry: Date | null = null,
  ): Promise<User> {
    const user = this.userRepo.create({
      email,
      passwordHash,
      name,
      isSuperAdmin: isSuperAdmin || false,
      organizationId,
      defaultRole,
      passwordVersion,
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpiry,
    });
    return this.userRepo.save(user);
  }

  /** Get all users (scoped to organization if provided) */
  async findAll(organizationId?: string): Promise<User[]> {
    if (organizationId) {
      return this.userRepo.findMany({ where: { organizationId } });
    }
    return this.userRepo.findMany();
  }

  /** Get one user by ID, or throw if not found */
  async findOneById(id: string): Promise<User> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /** Get one user by email, or null if not found */
  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepo.findByEmail(email.toLowerCase());
  }

  // ===========================================================================
  // EMAIL VERIFICATION
  // ===========================================================================

  /**
   * Verify a user's email address using the token from the verification link.
   *
   * EDGE CASES HANDLED:
   * 1. Malformed token (too short → reject before DB hit)
   * 2. No matching user for token (token not found in DB)
   * 3. Already verified user (idempotent — returns success)
   * 4. Expired token (past emailVerificationExpiry)
   * 5. Happy path: mark verified, clear token + expiry
   *
   * SECURITY:
   * - emailVerificationToken has `select: false` on the entity, so we must
   *   use createQueryBuilder with addSelect to fetch it.
   * - Token is cleared atomically after verification to prevent replay.
   *
   * @param token - The hex token from the verification URL
   * @returns Object with success status and message
   */
  async verifyEmail(
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    // Gate 1: Malformed token — our tokens are 64 hex chars (32 bytes)
    if (!token || token.length !== 64) {
      throw new BadRequestException('Invalid verification token format');
    }

    // emailVerificationToken is `select: false` on the entity — the abstract
    // repo encapsulates the addSelect dance.
    const user = await this.userRepo.findByVerificationToken(token);

    if (!user) {
      throw new NotFoundException(
        'Verification token not found or already used',
      );
    }

    // Gate 2: Already verified (idempotent — don't error)
    if (user.emailVerified) {
      return { success: true, message: 'Email is already verified' };
    }

    // Gate 3: Token expired (OWASP: 24h max for email verification)
    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      // Clear the expired token so it can't be retried
      user.emailVerificationToken = null;
      user.emailVerificationExpiry = null;
      await this.userRepo.save(user);

      throw new BadRequestException(
        'Verification token has expired. Please request a new verification email.',
      );
    }

    // Happy path: mark verified, clear token + expiry atomically
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;
    await this.userRepo.save(user);

    // Audit: EMAIL_VERIFIED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: user.organizationId || 'unknown',
      actor_id: user.id,
      resource_type: 'User',
      resource_id: user.id,
      action_type: 'UPDATE',
      action: 'EMAIL_VERIFIED',
      metadata: {
        severity: 'MEDIUM',
        email: user.email,
        requestId: this.cls.get<string>('requestId'),
      },
    });

    return { success: true, message: 'Email verified successfully' };
  }

  /** Activate or deactivate a user */
  async setActive(id: string, active: boolean): Promise<User> {
    const user = await this.findOneById(id);
    user.isActive = active;
    return this.userRepo.save(user);
  }

  async search(
    term: string,
    excludeProjectId?: string,
    organizationId?: string,
  ): Promise<UserSearchRow[]> {
    return this.userRepo.searchUsers(term, excludeProjectId, organizationId);
  }

  async update(id: string, dto: Partial<User>): Promise<User> {
    const user = await this.findOneById(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.defaultRole !== undefined) user.defaultRole = dto.defaultRole;
    if (dto.organizationId !== undefined)
      user.organizationId = dto.organizationId;
    if (dto.hashedRefreshToken !== undefined)
      user.hashedRefreshToken = dto.hashedRefreshToken;
    if (dto.passwordHash !== undefined) user.passwordHash = dto.passwordHash;
    if (dto.passwordVersion !== undefined)
      user.passwordVersion = dto.passwordVersion;
    return this.userRepo.save(user);
  }

  /** Get all users with their project memberships (scoped to organization) */
  async findAllWithProjectMemberships(
    organizationId?: string,
  ): Promise<UserWithMemberships[]> {
    return this.userRepo.findAllWithMemberships(organizationId);
  }

  /** List all users not assigned to any project (scoped to organization) */
  async findUnassigned(organizationId?: string): Promise<UserSearchRow[]> {
    return this.userRepo.findUnassigned(organizationId);
  }

  /** Change a user's password */
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    isSuperAdmin: boolean,
    currentSessionId?: string, // Session to preserve (optional)
  ): Promise<{ success: boolean; revokedSessions?: number }> {
    const user = await this.findOneById(id);
    // If not super admin, verify current password
    if (!isSuperAdmin) {
      if (!dto.currentPassword)
        throw new BadRequestException('Current password required');
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!valid) throw new ForbiddenException('Current password is incorrect');
    }
    // Layer 1: Password policy validation (NIST 800-63B + zxcvbn entropy)
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

    // Check password against known breaches (HIBP API - k-anonymity)
    const breachCheck = await this.passwordBreachService.checkPassword(
      dto.newPassword,
    );
    if (breachCheck.isBreached) {
      throw new BadRequestException(
        this.passwordBreachService.getBreachMessage(breachCheck.breachCount),
      );
    }

    // Use Argon2id for new password hash
    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // INCREMENT passwordVersion (for JWT invalidation)
    user.passwordVersion = (user.passwordVersion || 1) + 1;
    await this.userRepo.save(user);

    // REVOKE all sessions except current (Phase 2 - Session Invalidation)
    let revokedSessions = 0;
    if (currentSessionId) {
      revokedSessions = await this.sessionsService.revokeAllExceptCurrent(
        id,
        currentSessionId,
      );
    } else {
      // If no session ID provided, revoke ALL sessions
      revokedSessions = await this.sessionsService.revokeAllSessions(id);
    }

    // Audit: PASSWORD_CHANGE (Severity: HIGH)
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: user.organizationId || 'unknown',
      actor_id: id,
      resource_type: 'User',
      resource_id: id,
      action_type: 'UPDATE',
      action: 'PASSWORD_CHANGE',
      metadata: {
        severity: 'HIGH',
        newPasswordVersion: user.passwordVersion,
        revokedSessions,
        preservedCurrentSession: !!currentSessionId,
        requestId: this.cls.get<string>('requestId'),
      },
    });

    return { success: true, revokedSessions };
  }

  /** Delete a user's account (soft-delete: deactivate and anonymize) */
  async deleteAccount(id: string): Promise<{ success: boolean }> {
    const user = await this.findOneById(id);
    const originalEmail = user.email;
    const originalName = user.name;

    // Soft-delete: deactivate and anonymize user data for GDPR compliance
    user.isActive = false;
    user.name = 'Deleted User';
    user.email = `deleted-${user.id}@deleted.local`;
    user.avatarUrl = undefined;
    user.hashedRefreshToken = undefined;
    user.passwordHash = ''; // Invalidate password
    // Clear email verification data (GDPR: no PII retention)
    user.emailVerified = false;
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;

    await this.userRepo.save(user);

    // Audit: USER_DELETED (Severity: CRITICAL)
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: user.organizationId || 'unknown',
      actor_id: id,
      resource_type: 'User',
      resource_id: id,
      action_type: 'DELETE',
      action: 'USER_DELETED',
      metadata: {
        severity: 'CRITICAL',
        originalEmail,
        originalName,
        requestId: this.cls.get<string>('requestId'),
      },
    });

    return { success: true };
  }
}
