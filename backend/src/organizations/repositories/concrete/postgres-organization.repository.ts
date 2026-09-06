/**
 * PostgresOrganizationRepository — TypeORM Concrete Implementation.
 *
 * Fulfills the `OrganizationRepository` abstract contract using TypeORM.
 * This is the ONLY class in the organizations module that touches
 * `@InjectRepository(Organization)`.
 *
 * @see OrganizationRepository for the abstract contract.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { CreateOrganizationDto } from '../../dto/create-organization.dto';
import { OrganizationRepository } from '../abstract/organization.repository.abstract';

@Injectable()
export class PostgresOrganizationRepository extends OrganizationRepository {
  constructor(
    @InjectRepository(Organization)
    private readonly repo: Repository<Organization>,
  ) {
    super();
  }

  async findOne(id: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async save(organization: Organization): Promise<Organization> {
    return this.repo.save(organization);
  }

  create(dto: CreateOrganizationDto): Promise<Organization> {
    const entity = this.repo.create({
      name: dto.name,
      slug: dto.slug,
    });
    return Promise.resolve(entity);
  }

  async findByCustomerId(
    stripeCustomerId: string,
  ): Promise<Organization | null> {
    return this.repo.findOne({ where: { stripeCustomerId } });
  }

  async updateSubscriptionStatus(
    orgId: string,
    status: string,
    metadata?: {
      stripeSubscriptionId?: string;
      currentPeriodEnd?: Date;
    },
  ): Promise<Organization> {
    const org = await this.repo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }
    org.subscriptionStatus = status;
    if (metadata?.stripeSubscriptionId) {
      org.stripeSubscriptionId = metadata.stripeSubscriptionId;
    }
    if (metadata?.currentPeriodEnd) {
      org.currentPeriodEnd = metadata.currentPeriodEnd;
    }
    return this.repo.save(org);
  }
}
