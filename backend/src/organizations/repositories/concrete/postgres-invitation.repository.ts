/**
 * PostgresInvitationRepository — TypeORM Concrete Implementation.
 *
 * Fulfills the `InvitationRepository` abstract contract using TypeORM.
 * This is the ONLY class in the organizations module that touches
 * `@InjectRepository(OrganizationInvitation)`.
 *
 * @see InvitationRepository for the abstract contract.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  OrganizationInvitation,
  InvitationStatus,
} from '../../entities/organization-invitation.entity';
import {
  InvitationRepository,
  InvitationFindOptions,
  InvitationListOptions,
} from '../abstract/invitation.repository.abstract';

@Injectable()
export class PostgresInvitationRepository extends InvitationRepository {
  constructor(
    @InjectRepository(OrganizationInvitation)
    private readonly repo: Repository<OrganizationInvitation>,
  ) {
    super();
  }

  async findOne(
    options: InvitationFindOptions,
  ): Promise<OrganizationInvitation | null> {
    const where: Record<string, unknown> = {};

    if (options.id) where.id = options.id;
    if (options.token) where.token = options.token;
    if (options.organizationId) where.organizationId = options.organizationId;
    if (options.email) where.email = options.email;
    if (options.status) where.status = options.status;

    return this.repo.findOne({
      where,
      relations: options.relations,
    });
  }

  async find(
    options: InvitationListOptions,
  ): Promise<OrganizationInvitation[]> {
    const where: Record<string, unknown> = {
      organizationId: options.organizationId,
    };

    if (options.status) where.status = options.status;

    return this.repo.find({
      where,
      relations: options.relations,
      order: options.orderBy
        ? { [options.orderBy.field]: options.orderBy.direction }
        : undefined,
    });
  }

  async save(
    invitation: OrganizationInvitation,
  ): Promise<OrganizationInvitation> {
    return this.repo.save(invitation);
  }

  async remove(invitation: OrganizationInvitation): Promise<void> {
    await this.repo.remove(invitation);
  }

  async updateExpired(organizationId: string): Promise<number> {
    const result = await this.repo.update(
      {
        organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      { status: InvitationStatus.EXPIRED },
    );
    return result.affected ?? 0;
  }
}
