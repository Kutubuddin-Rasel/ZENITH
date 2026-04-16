/**
 * Organizations Service — Invitation Workflow & Organization CRUD
 *
 * ARCHITECTURE:
 * This service handles organization lifecycle and the secure invitation flow.
 * It does NOT handle organization settings (see OrganizationSettingsService).
 *
 * SECURITY:
 * - 256-bit hex tokens (64 chars) for invitations
 * - 7-day token expiration with auto-expire on query
 * - Duplicate prevention (existing member + pending invite checks)
 * - Email domain enforcement via OrganizationSettingsService
 *
 * AUDIT:
 * All state-changing operations (invite, revoke, accept) are logged
 * with AuditLogsService for compliance and forensics.
 *
 * @see OrganizationSettingsService for tenant customization
 */

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Organization } from './entities/organization.entity';
import {
  OrganizationInvitation,
  InvitationStatus,
} from './entities/organization-invitation.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { AuditLogsService } from '../audit/audit-logs.service';
import { ClsService } from 'nestjs-cls';
import { generateHexToken } from '../common/utils/token.util';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly organizationsRepository: Repository<Organization>,
    @InjectRepository(OrganizationInvitation)
    private readonly invitationsRepository: Repository<OrganizationInvitation>,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly settingsService: OrganizationSettingsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
  ) {}

  // ===========================================================================
  // ORGANIZATION CRUD
  // ===========================================================================

  /**
   * Create a new organization.
   * Generates a URL-friendly slug from the name if not provided.
   */
  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const slug = dto.slug || this.generateSlug(dto.name);

    const existing = await this.organizationsRepository.findOne({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException('Organization with this name already exists');
    }

    const organization = this.organizationsRepository.create({
      name: dto.name,
      slug,
    });

    return this.organizationsRepository.save(organization);
  }

  /** Find organization by ID */
  async findOne(id: string): Promise<Organization | null> {
    return this.organizationsRepository.findOne({ where: { id } });
  }

  /** Find organization by slug */
  async findBySlug(slug: string): Promise<Organization | null> {
    return this.organizationsRepository.findOne({ where: { slug } });
  }

  /** Generate URL-friendly slug from organization name */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ===========================================================================
  // INVITATION WORKFLOW
  // ===========================================================================

  /**
   * Invite a user to an organization.
   *
   * VALIDATION GATES:
   * 1. Email domain restriction (if configured in OrganizationSettings)
   * 2. Existing member check (user already belongs to this org)
   * 3. Pending invite check (duplicate prevention)
   *
   * SECURITY:
   * - 256-bit hex token (64 chars) — same entropy as auth tokens
   * - 7-day expiration
   * - Email sent via EmailService
   *
   * AUDIT: INVITE_CREATED logged with email, role, organizationId
   */
  async inviteUser(
    organizationId: string,
    email: string,
    role: string,
    invitedById: string,
  ): Promise<{ token: string }> {
    // Gate 1: Email domain restriction
    const isDomainAllowed = await this.settingsService.isEmailDomainAllowed(
      organizationId,
      email,
    );
    if (!isDomainAllowed) {
      const emailDomain = email.split('@')[1] || 'unknown';
      throw new ForbiddenException(
        `Email domain "${emailDomain}" is not in the organization's allowed domains list`,
      );
    }

    // Gate 2: Already a member
    const existingUser = await this.usersService.findOneByEmail(email);
    if (existingUser && existingUser.organizationId === organizationId) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    // Gate 3: Pending invite
    const existingInvite = await this.invitationsRepository.findOne({
      where: { organizationId, email, status: InvitationStatus.PENDING },
    });
    if (existingInvite) {
      throw new ConflictException('User already has a pending invitation');
    }

    const token = generateHexToken(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const invite = this.invitationsRepository.create({
      organizationId,
      email,
      role,
      token,
      expiresAt,
      invitedById,
      status: InvitationStatus.PENDING,
    });

    await this.invitationsRepository.save(invite);

    // Get org name and inviter name for the email
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const inviter = await this.usersService.findOneById(invitedById);

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

    // Send invitation email
    await this.emailService.sendInvitationEmail(
      email,
      inviteLink,
      inviter.name || inviter.email,
      organization.name,
    );

    // Audit: INVITE_CREATED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: organizationId,
      actor_id: invitedById,
      resource_type: 'OrganizationInvitation',
      resource_id: invite.id,
      action_type: 'CREATE',
      action: 'INVITE_CREATED',
      metadata: {
        severity: 'MEDIUM',
        email,
        role,
        organizationName: organization.name,
        expiresAt: expiresAt.toISOString(),
        requestId: this.cls.get<string>('requestId'),
      },
    });

    return { token };
  }

  /**
   * Validate an invitation token.
   *
   * Checks: exists, status is PENDING, not expired.
   * Auto-expires tokens that are past their expiry date.
   */
  async validateInvite(token: string): Promise<OrganizationInvitation> {
    const invite = await this.invitationsRepository.findOne({
      where: { token },
      relations: ['organization', 'invitedBy'],
    });

    if (!invite) {
      throw new NotFoundException('Invalid invitation token');
    }

    if (invite.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        `Invitation is ${invite.status.toLowerCase()}`,
      );
    }

    if (invite.expiresAt < new Date()) {
      invite.status = InvitationStatus.EXPIRED;
      await this.invitationsRepository.save(invite);
      throw new BadRequestException('Invitation has expired');
    }

    return invite;
  }

  /**
   * Accept an invitation.
   *
   * FLOW:
   * 1. Validate token (exists, pending, not expired)
   * 2. Check user isn't already in an org
   * 3. Assign user to the org
   * 4. Mark invite as ACCEPTED
   *
   * AUDIT: INVITE_ACCEPTED logged
   */
  async acceptInvite(
    token: string,
    userId: string,
  ): Promise<OrganizationInvitation> {
    const invite = await this.validateInvite(token);
    const user = await this.usersService.findOneById(userId);

    if (user.organizationId) {
      throw new ConflictException(
        'You are already a member of an organization',
      );
    }

    // Assign user to organization
    await this.usersService.update(user.id, {
      organizationId: invite.organizationId,
    });

    // Mark invite as accepted
    invite.status = InvitationStatus.ACCEPTED;
    const updatedInvite = await this.invitationsRepository.save(invite);

    // Audit: INVITE_ACCEPTED
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: invite.organizationId,
      actor_id: userId,
      resource_type: 'OrganizationInvitation',
      resource_id: invite.id,
      action_type: 'UPDATE',
      action: 'INVITE_ACCEPTED',
      metadata: {
        severity: 'MEDIUM',
        email: invite.email,
        role: invite.role,
        requestId: this.cls.get<string>('requestId'),
      },
    });

    return updatedInvite;
  }

  /**
   * Revoke an invitation (hard delete).
   *
   * AUDIT: INVITE_REVOKED logged before deletion.
   */
  async revokeInvite(organizationId: string, inviteId: string): Promise<void> {
    const invite = await this.invitationsRepository.findOne({
      where: { id: inviteId, organizationId },
    });

    if (!invite) {
      throw new NotFoundException('Invitation not found');
    }

    // Audit BEFORE deletion (we need the data)
    await this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: organizationId,
      actor_id: this.cls.get<string>('userId') || 'system',
      resource_type: 'OrganizationInvitation',
      resource_id: inviteId,
      action_type: 'DELETE',
      action: 'INVITE_REVOKED',
      metadata: {
        severity: 'MEDIUM',
        email: invite.email,
        role: invite.role,
        requestId: this.cls.get<string>('requestId'),
      },
    });

    await this.invitationsRepository.remove(invite);
  }

  /**
   * Get pending invitations for an organization.
   * Auto-expires any invitations past their expiry date before returning.
   */
  async getPendingInvites(
    organizationId: string,
  ): Promise<OrganizationInvitation[]> {
    // Auto-expire old invites
    await this.invitationsRepository.update(
      {
        organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      { status: InvitationStatus.EXPIRED },
    );

    return this.invitationsRepository.find({
      where: {
        organizationId,
        status: InvitationStatus.PENDING,
      },
      relations: ['invitedBy'],
      order: { createdAt: 'DESC' },
    });
  }
}
