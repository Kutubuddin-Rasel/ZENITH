import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
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
import { generateHexToken } from '../common/utils/token.util';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationsRepository: Repository<Organization>,
    @InjectRepository(OrganizationInvitation)
    private invitationsRepository: Repository<OrganizationInvitation>,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  /**
   * Create a new organization
   */
  async create(dto: CreateOrganizationDto): Promise<Organization> {
    // Generate slug if not provided
    const slug = dto.slug || this.generateSlug(dto.name);

    // Check if slug already exists
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

  /**
   * Find organization by ID
   */
  async findOne(id: string): Promise<Organization | null> {
    return this.organizationsRepository.findOne({ where: { id } });
  }

  /**
   * Find organization by slug
   */
  async findBySlug(slug: string): Promise<Organization | null> {
    return this.organizationsRepository.findOne({ where: { slug } });
  }

  /**
   * Generate URL-friendly slug from organization name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Invite a user to an organization
   */
  async inviteUser(
    organizationId: string,
    email: string,
    role: string,
    invitedById: string,
  ): Promise<{ token: string }> {
    // Check if user is already a member
    const existingUser = await this.usersService.findOneByEmail(email);
    if (existingUser && existingUser.organizationId === organizationId) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    // Check for pending invite
    const existingInvite = await this.invitationsRepository.findOne({
      where: { organizationId, email, status: InvitationStatus.PENDING },
    });
    if (existingInvite) {
      throw new ConflictException('User already has a pending invitation');
    }

    const token = generateHexToken(64); // 64 hex chars for invite token
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

    // Get organization name and inviter name for the email
    const organization = await this.organizationsRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const inviter = await this.usersService.findOneById(invitedById);
    if (!inviter) throw new NotFoundException('Inviter user not found');

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

    // Send email via EmailService
    await this.emailService.sendInvitationEmail(
      email,
      inviteLink,
      inviter.name || inviter.email,
      organization.name,
    );

    return { token };
  }

  /**
   * Validate an invitation token
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
   * Accept an invitation
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

    // Update user
    user.organizationId = invite.organizationId;
    // user.role = invite.role; // TODO: Handle role assignment if User entity supports it
    await this.usersService.update(user.id, {
      organizationId: invite.organizationId,
    });

    // Update invite
    invite.status = InvitationStatus.ACCEPTED;
    return this.invitationsRepository.save(invite);
  }

  /**
   * Revoke an invitation
   */
  async revokeInvite(organizationId: string, inviteId: string): Promise<void> {
    const invite = await this.invitationsRepository.findOne({
      where: { id: inviteId, organizationId },
    });

    if (!invite) {
      throw new NotFoundException('Invitation not found');
    }

    await this.invitationsRepository.remove(invite);
  }

  /**
   * Get pending invitations for an organization
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
