import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { InviteStatus } from './enums/invite-status.enum';
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
    private readonly dataSource: DataSource,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

    let resolvedInviteeId: string | null = null;
    let resolvedInviteeEmail: string | null = null;

    if (inviteeId) {
      // Direct user ID provided — resolve to existing user
      resolvedInviteeId = inviteeId;
    } else if (email) {
      // Email provided — attempt to resolve to existing user
      const user = await this.usersService.findOneByEmail(email);
      if (user) {
        resolvedInviteeId = user.id;
      } else {
        // Shadow Account: user does not exist yet — store email only
        resolvedInviteeEmail = email;
      }
    } else {
      throw new BadRequestException(
        'Either inviteeId or email must be provided',
      );
    }

    // Duplicate-invite guard: check for active (Pending) invite to same target
    if (resolvedInviteeId) {
      const existing = await this.inviteRepo.findOne({
        where: {
          projectId,
          inviteeId: resolvedInviteeId,
          status: InviteStatus.Pending,
        },
        order: { createdAt: 'DESC' },
      });
      if (existing) {
        throw new BadRequestException(
          'Active invite already exists for this user/project',
        );
      }
    } else if (resolvedInviteeEmail) {
      const existing = await this.inviteRepo.findOne({
        where: {
          projectId,
          inviteeEmail: resolvedInviteeEmail,
          status: InviteStatus.Pending,
        },
        order: { createdAt: 'DESC' },
      });
      if (existing) {
        throw new BadRequestException(
          'Active invite already exists for this email/project',
        );
      }
    }

    const token = randomBytes(32).toString('hex');
    const invite = this.inviteRepo.create({
      token,
      projectId,
      inviteeId: resolvedInviteeId,
      inviteeEmail: resolvedInviteeEmail,
      inviterId,
      role,
      status: InviteStatus.Pending,
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

    if (invite.status !== InviteStatus.Pending) {
      throw new BadRequestException('Can only revoke a pending invite.');
    }

    invite.status = InviteStatus.Revoked;
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
    if (invite.status !== InviteStatus.Pending) {
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
    if (invite.status !== InviteStatus.Pending)
      throw new BadRequestException('Invite already responded');

    // CRITICAL: Expiration validation — must occur BEFORE any state transition
    // Uses UTC comparison (Date instances are always UTC internally in Node.js)
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      invite.status = InviteStatus.Expired;
      await this.inviteRepo.save(invite);
      throw new BadRequestException('Invite has expired');
    }

    invite.status = accept ? InviteStatus.Accepted : InviteStatus.Rejected;
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

  /**
   * Create multiple invites in a single transactional batch.
   *
   * Design decisions:
   * - Uses queryRunner for explicit transaction control
   * - Individual failures are isolated (don't fail the entire batch)
   * - A single `invite.bulk.created` event is emitted for efficiency
   * - Preserves shadow-account logic: email-only entries create inviteeEmail invites
   */
  async bulkInvite(data: {
    projectId: string;
    inviterId: string;
    defaultRole: string;
    expiresInHours?: number;
    invites: Array<{ inviteeId?: string; email?: string; role?: string }>;
  }): Promise<{ created: Invite[]; failed: Array<{ index: number; reason: string }> }> {
    const { projectId, inviterId, defaultRole, expiresInHours, invites } = data;
    const created: Invite[] = [];
    const failed: Array<{ index: number; reason: string }> = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let i = 0; i < invites.length; i++) {
        const entry = invites[i];
        const role = entry.role || defaultRole;

        try {
          let resolvedInviteeId: string | null = null;
          let resolvedInviteeEmail: string | null = null;

          if (entry.inviteeId) {
            resolvedInviteeId = entry.inviteeId;
          } else if (entry.email) {
            const user = await this.usersService.findOneByEmail(entry.email);
            if (user) {
              resolvedInviteeId = user.id;
            } else {
              resolvedInviteeEmail = entry.email;
            }
          } else {
            failed.push({ index: i, reason: 'Either inviteeId or email must be provided' });
            continue;
          }

          // Duplicate-invite guard within transaction scope
          if (resolvedInviteeId) {
            const existing = await queryRunner.manager.findOne(Invite, {
              where: { projectId, inviteeId: resolvedInviteeId, status: InviteStatus.Pending },
            });
            if (existing) {
              failed.push({ index: i, reason: 'Active invite already exists for this user/project' });
              continue;
            }
          } else if (resolvedInviteeEmail) {
            const existing = await queryRunner.manager.findOne(Invite, {
              where: { projectId, inviteeEmail: resolvedInviteeEmail, status: InviteStatus.Pending },
            });
            if (existing) {
              failed.push({ index: i, reason: 'Active invite already exists for this email/project' });
              continue;
            }
          }

          const token = randomBytes(32).toString('hex');
          const invite = queryRunner.manager.create(Invite, {
            token,
            projectId,
            inviteeId: resolvedInviteeId,
            inviteeEmail: resolvedInviteeEmail,
            inviterId,
            role,
            status: InviteStatus.Pending,
            expiresAt: expiresInHours
              ? new Date(Date.now() + expiresInHours * 3600 * 1000)
              : undefined,
          });

          const saved = await queryRunner.manager.save(invite);
          created.push(saved);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          failed.push({ index: i, reason: message });
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Emit single bulk event AFTER successful commit for efficiency
    if (created.length > 0) {
      const project = await this.projectsService.findOneById(projectId);
      this.eventEmitter.emit('invite.bulk.created', {
        invites: created,
        project,
        inviterId,
        count: created.length,
        failedCount: failed.length,
      });
    }

    return { created, failed };
  }
}
