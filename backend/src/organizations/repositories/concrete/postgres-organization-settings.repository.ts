/**
 * PostgresOrganizationSettingsRepository — TypeORM Concrete Implementation.
 *
 * Fulfills the `OrganizationSettingsRepository` abstract contract using TypeORM.
 * This is the ONLY class in the organizations module that touches
 * `@InjectRepository(OrganizationSettings)`.
 *
 * @see OrganizationSettingsRepository for the abstract contract.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationSettings } from '../../entities/organization-settings.entity';
import { OrganizationSettingsRepository } from '../abstract/organization-settings.repository.abstract';

@Injectable()
export class PostgresOrganizationSettingsRepository extends OrganizationSettingsRepository {
  constructor(
    @InjectRepository(OrganizationSettings)
    private readonly repo: Repository<OrganizationSettings>,
  ) {
    super();
  }

  async findOne(organizationId: string): Promise<OrganizationSettings | null> {
    return this.repo.findOne({ where: { organizationId } });
  }

  async save(settings: OrganizationSettings): Promise<OrganizationSettings> {
    return this.repo.save(settings);
  }

  create(data: Partial<OrganizationSettings>): OrganizationSettings {
    return this.repo.create(data);
  }
}
