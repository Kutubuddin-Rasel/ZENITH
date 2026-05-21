import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invite } from '../../entities/invite.entity';
import { InviteStatus } from '../../enums/invite-status.enum';
import {
  AbstractInviteRepository,
  BulkInviteRepoEntry,
  BulkInviteRepoResult,
} from '../abstract/invite.repository.abstract';

/**
 * Postgres Invite Repository
 *
 * The ONLY class — inside or outside the invites module — that owns
 * TypeORM's `Repository<Invite>` and `DataSource`. Every other
 * consumer (services, controllers, listeners) must depend on
 * `AbstractInviteRepository`, so the ORM and transaction strategy
 * can be swapped without touching domain logic.
 *
 * Query-shape notes
 * -----------------
 *  - `findByToken` eager-loads the `invitee` relation because the
 *    redeem-invite flow short-circuits when the token already maps
 *    to an existing user.
 *  - `findForProject` eager-loads `invitee` + `inviter` (the admin
 *    UI renders both). Ordered newest-first so the most recent
 *    invites appear at the top of the list.
 *  - `findByProject` does NOT load relations — retained for binary
 *    compatibility with the legacy `InvitesService.findByProject`
 *    helper; no current call site uses it.
 *  - `findActivePending` selects only `Pending` rows and orders
 *    `createdAt DESC` so the duplicate guard always inspects the
 *    most recent attempt. Either `inviteeId` OR `inviteeEmail` must
 *    be supplied — never both.
 *
 * Transaction semantics for `bulkCreateInTransaction`
 * ---------------------------------------------------
 *  - Opens a single `QueryRunner`, runs duplicate detection through
 *    `manager.findOne(Invite, …)` so reads join the same
 *    transaction as writes (read-modify-write window is closed).
 *  - Per-row duplicates collapse into `failed[]` rather than
 *    aborting the transaction — the admin UI renders per-entry
 *    success/failure.
 *  - Any unexpected throw inside the loop is caught and recorded
 *    against the offending entry, matching the legacy
 *    `InvitesService.bulkInvite` behaviour exactly.
 *  - The transaction is committed once the loop completes; the
 *    runner is ALWAYS released in `finally`.
 */
@Injectable()
export class PostgresInviteRepository extends AbstractInviteRepository {
  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepo: Repository<Invite>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findById(id: string): Promise<Invite | null> {
    return this.inviteRepo.findOne({ where: { id } });
  }

  async findByToken(token: string): Promise<Invite | null> {
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

  async findByProject(projectId: string): Promise<Invite[]> {
    return this.inviteRepo.find({ where: { projectId } });
  }

  async findActivePending(
    projectId: string,
    target: { inviteeId?: string; inviteeEmail?: string },
  ): Promise<Invite | null> {
    if (target.inviteeId) {
      return this.inviteRepo.findOne({
        where: {
          projectId,
          inviteeId: target.inviteeId,
          status: InviteStatus.Pending,
        },
        order: { createdAt: 'DESC' },
      });
    }
    if (target.inviteeEmail) {
      return this.inviteRepo.findOne({
        where: {
          projectId,
          inviteeEmail: target.inviteeEmail,
          status: InviteStatus.Pending,
        },
        order: { createdAt: 'DESC' },
      });
    }
    return null;
  }

  async save(invite: Invite): Promise<Invite> {
    return this.inviteRepo.save(invite);
  }

  createEntity(data: Partial<Invite>): Invite {
    return this.inviteRepo.create(data);
  }

  async bulkCreateInTransaction(
    projectId: string,
    inviterId: string,
    entries: readonly BulkInviteRepoEntry[],
  ): Promise<BulkInviteRepoResult> {
    const created: Invite[] = [];
    const failed: Array<{ index: number; reason: string }> = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const entry of entries) {
        try {
          if (entry.inviteeId) {
            const existing = await queryRunner.manager.findOne(Invite, {
              where: {
                projectId,
                inviteeId: entry.inviteeId,
                status: InviteStatus.Pending,
              },
            });
            if (existing) {
              failed.push({
                index: entry.index,
                reason: 'Active invite already exists for this user/project',
              });
              continue;
            }
          } else if (entry.inviteeEmail) {
            const existing = await queryRunner.manager.findOne(Invite, {
              where: {
                projectId,
                inviteeEmail: entry.inviteeEmail,
                status: InviteStatus.Pending,
              },
            });
            if (existing) {
              failed.push({
                index: entry.index,
                reason: 'Active invite already exists for this email/project',
              });
              continue;
            }
          }

          const invite = queryRunner.manager.create(Invite, {
            token: entry.token,
            projectId,
            inviteeId: entry.inviteeId,
            inviteeEmail: entry.inviteeEmail,
            inviterId,
            role: entry.role,
            status: InviteStatus.Pending,
            expiresAt: entry.expiresAt,
          });

          const saved = await queryRunner.manager.save(invite);
          created.push(saved);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          failed.push({ index: entry.index, reason: message });
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return { created, failed };
  }
}
