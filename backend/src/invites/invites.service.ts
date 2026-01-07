import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { randomBytes } from 'crypto';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepo: Repository<Invite>,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async createInvite(data: {
    projectId: string;
    inviteeId?: string;
    email?: string;
    inviterId: string;
    role: string;
    expiresInHours?: number;
  }): Promise<Invite> {
    const { projectId, inviteeId, email, inviterId, role, expiresInHours } =
      data;

    let actualInviteeId: string;

    if (inviteeId) {
      actualInviteeId = inviteeId;
    } else if (email) {
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        throw new BadRequestException(`User with email ${email} not found`);
      }
      actualInviteeId = user.id;
    } else {
      throw new BadRequestException(
        'Either inviteeId or email must be provided',
      );
    }

    const existing = await this.inviteRepo.findOne({
      where: { projectId, inviteeId: actualInviteeId, status: 'Pending' },
      order: { createdAt: 'DESC' },
    });
    if (existing)
      throw new BadRequestException(
        'Active invite already exists for this user/project',
      );

    const token = randomBytes(32).toString('hex');
    const invite = this.inviteRepo.create({
      token,
      projectId,
      inviteeId: actualInviteeId,
      inviterId,
      role,
      status: 'Pending',
      expiresAt: expiresInHours
        ? new Date(Date.now() + expiresInHours * 3600 * 1000)
        : undefined,
    });
    const savedInvite = await this.inviteRepo.save(invite);

    // Emit event to notify the invited user about the new invitation
    const project = await this.projectsService.findOneById(projectId);
    this.eventEmitter.emit('invite.created', {
      invite: savedInvite,
      project,
      role,
    });

    return savedInvite;
  }

  async findOneByToken(token: string): Promise<Invite | null> {
    return this.inviteRepo.findOne({
      where: { token },
      relations: ['invitee'],
    });
  }

  async findForProject(projectId: string): Promise<Invite[]> {
    return this.inviteRepo.find({
      where: { projectId },
      relations: ['invitee', 'inviter'],
      order: { createdAt: 'DESC' },
    });
  }

  async revokeInvite(inviteId: string, currentUserId: string): Promise<void> {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.inviterId !== currentUserId) {
      throw new ForbiddenException(
        'You do not have permission to revoke this invite.',
      );
    }

    if (invite.status !== 'Pending') {
      throw new BadRequestException('Can only revoke a pending invite.');
    }

    invite.status = 'Revoked';
    await this.inviteRepo.save(invite);

    // Emit event to notify the invited user that their invitation has been revoked
    const project = await this.projectsService.findOneById(invite.projectId);
    this.eventEmitter.emit('invite.revoked', {
      invite,
      project,
    });
  }

  async resendInvite(inviteId: string, currentUserId: string): Promise<void> {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.inviterId !== currentUserId) {
      throw new ForbiddenException(
        'You do not have permission to resend this invite.',
      );
    }
    if (invite.status !== 'Pending') {
      throw new BadRequestException('Can only resend a pending invite.');
    }

    const project = await this.projectsService.findOneById(invite.projectId);

    this.eventEmitter.emit('invite.resend', {
      invite,
      project,
    });
  }

  async respondToInvite(
    inviteId: string,
    userId: string,
    accept: boolean,
    reason?: string,
  ) {
    const invite = await this.inviteRepo.findOne({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException();
    if (invite.inviteeId !== userId)
      throw new ForbiddenException('Not your invite');
    if (invite.status !== 'Pending')
      throw new BadRequestException('Invite already responded');

    invite.status = accept ? 'Accepted' : 'Rejected';
    invite.respondedAt = new Date();
    invite.reason = reason;
    await this.inviteRepo.save(invite);

    if (accept) {
      await this.projectMembersService.addMemberToProject({
        projectId: invite.projectId,
        userId,
        roleName:
          invite.role as import('../membership/enums/project-role.enum').ProjectRole,
      });
    }

    const project = await this.projectsService.findOneById(invite.projectId);
    const invitee = await this.usersService.findOneById(userId);
    const message = accept
      ? `${invitee?.name ?? invitee?.email ?? ''} accepted your invite to Project " ${project?.name ?? ''} "`
      : `${invitee?.name ?? invitee?.email ?? ''} rejected your invite to Project " ${project?.name ?? ''} ": " ${reason ?? ''} "`;

    this.eventEmitter.emit('invite.responded', {
      invite,
      project,
      invitee,
      message,
      accept,
      reason,
    });
  }

  async findByProject(projectId: string) {
    return this.inviteRepo.find({ where: { projectId } });
  }
}
