import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';

import { User } from './entities/user.entity';
import { AuditLogsService } from '../audit/audit-logs.service';

// SOLID Refactor (Step 3): Depend on the abstract User repository token (DIP).
import { UserRepository } from '../database/repositories/user.repository';
import {
  UserSearchRow,
  UserWithMemberships,
} from '../database/interfaces/repository.interfaces';
import {
  USER_DELETED_EVENT,
  UserDeletedEvent,
} from '../core/events/payloads/user-deleted.event';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
    private readonly eventEmitter: EventEmitter2,
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
   */
  async verifyEmail(
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!token || token.length !== 64) {
      throw new BadRequestException('Invalid verification token format');
    }

    const user = await this.userRepo.findByVerificationToken(token);

    if (!user) {
      throw new NotFoundException(
        'Verification token not found or already used',
      );
    }

    if (user.emailVerified) {
      return { success: true, message: 'Email is already verified' };
    }

    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      user.emailVerificationToken = null;
      user.emailVerificationExpiry = null;
      await this.userRepo.save(user);

      throw new BadRequestException(
        'Verification token has expired. Please request a new verification email.',
      );
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiry = null;
    await this.userRepo.save(user);

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

  /**
   * Soft-delete and anonymise a user account (GDPR-compliant).
   *
   * The users module owns ONLY the domain-level anonymisation (PII strip,
   * deactivation, audit). Auth-secret wiping and session revocation are
   * handled out-of-band by `UserLifecycleService` via `USER_DELETED_EVENT`.
   */
  async deleteAccount(id: string): Promise<{ success: boolean }> {
    const user = await this.findOneById(id);
    const originalEmail = user.email;
    const originalName = user.name;
    const organizationId = user.organizationId ?? null;
    const requestId = this.cls.get<string>('requestId') ?? null;

    user.isActive = false;
    user.name = 'Deleted User';
    user.email = `deleted-${user.id}@deleted.local`;
    user.avatarUrl = undefined;
    await this.userRepo.save(user);

    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: organizationId || 'unknown',
      actor_id: id,
      resource_type: 'User',
      resource_id: id,
      action_type: 'DELETE',
      action: 'USER_DELETED',
      metadata: {
        severity: 'CRITICAL',
        originalEmail,
        originalName,
        requestId,
      },
    });

    const event: UserDeletedEvent = {
      userId: id,
      originalEmail,
      originalName,
      organizationId,
      requestId,
      deletedAt: new Date(),
    };
    this.eventEmitter.emit(USER_DELETED_EVENT, event);

    return { success: true };
  }
}
