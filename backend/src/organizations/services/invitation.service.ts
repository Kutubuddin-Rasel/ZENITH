/**
 * InvitationService — SRP-Extracted Invitation Workflow.
 *
 * ARCHITECTURE (Step 3):
 * Extracted from OrganizationsService to enforce Single Responsibility.
 * OrganizationsService now handles ONLY org CRUD.
 *
 * DIP: Injects IUserLookup (not concrete UsersService), breaking
 * the cross-domain circular dependency.
 *
 * SECURITY:
 * - 256-bit hex tokens (64 chars) for invitations
 * - 7-day token expiration with auto-expire on query
 * - Duplicate prevention (existing member + pending invite checks)
 * - Email domain enforcement via OrganizationSettingsService
 */

import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  OrganizationInvitation,
  InvitationStatus,
} from '../entities/organization-invitation.entity';
import { OrganizationSettingsService } from '../organization-settings.service';
import { AuditLogsService } from '../../audit/audit-logs.service';
import { ClsService } from 'nestjs-cls';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generateHexToken } from '../../common/utils/token.util';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationRepository } from '../repositories/abstract/organization.repository.abstract';
import { InvitationRepository } from '../repositories/abstract/invitation.repository.abstract';
import { IInvitationService } from '../interfaces/organization.interfaces';
import { IUserLookup } from '../interfaces/user-lookup.interface';
import { USER_LOOKUP_TOKEN } from '../constants/organization.tokens';
import { InvitationCreatedEvent } from '../../core/events/payloads/invitation-created.event';

@Injectable()
export class InvitationService implements IInvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    private readonly invitationsRepository: InvitationRepository,
    private readonly organizationsRepository: OrganizationRepository,
    @Inject(USER_LOOKUP_TOKEN) private readonly userLookup: IUserLookup,
    private readonly eventEmitter: EventEmitter2,
    private readonly settingsService: OrganizationSettingsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly cls: ClsService,
  ) {}

  async inviteUser(
    organizationId: string,
    email: string,
    role: string,
    invitedById: string,
  ): Promise<{ token: string }> {
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

    const existingUser = await this.userLookup.findOneByEmail(email);
    if (existingUser && existingUser.organizationId === organizationId) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    const existingInvite = await this.invitationsRepository.findOne({
      organizationId,
      email,
      status: InvitationStatus.PENDING,
    });
    if (existingInvite) {
      throw new ConflictException('User already has a pending invitation');
    }

    const token = generateHexToken(64);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = new OrganizationInvitation();
    invite.organizationId = organizationId;
    invite.email = email;
    invite.role = role;
    invite.token = token;
    invite.expiresAt = expiresAt;
    invite.invitedById = invitedById;
    invite.status = InvitationStatus.PENDING;

    await this.invitationsRepository.save(invite);

    const organization =
      await this.organizationsRepository.findOne(organizationId);
    if (!organization) throw new NotFoundException('Organization not found');
    const inviter = await this.userLookup.findOneById(invitedById);

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

    this.eventEmitter.emit(
      InvitationCreatedEvent.EVENT_NAME,
      new InvitationCreatedEvent(
        email,
        inviteLink,
        inviter.name || inviter.email,
        organization.name,
      ),
    );

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

  async validateInvite(token: string): Promise<OrganizationInvitation> {
    const invite = await this.invitationsRepository.findOne({
      token,
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

  async acceptInvite(
    token: string,
    userId: string,
  ): Promise<OrganizationInvitation> {
    const invite = await this.validateInvite(token);
    const user = await this.userLookup.findOneById(userId);

    if (user.organizationId) {
      throw new ConflictException(
        'You are already a member of an organization',
      );
    }

    await this.userLookup.update(user.id, {
      organizationId: invite.organizationId,
    });

    invite.status = InvitationStatus.ACCEPTED;
    const updatedInvite = await this.invitationsRepository.save(invite);

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

  async revokeInvite(organizationId: string, inviteId: string): Promise<void> {
    const invite = await this.invitationsRepository.findOne({
      id: inviteId,
      organizationId,
    });

    if (!invite) {
      throw new NotFoundException('Invitation not found');
    }

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

  async getPendingInvites(
    organizationId: string,
  ): Promise<OrganizationInvitation[]> {
    await this.invitationsRepository.updateExpired(organizationId);

    return this.invitationsRepository.find({
      organizationId,
      status: InvitationStatus.PENDING,
      relations: ['invitedBy'],
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });
  }
}
