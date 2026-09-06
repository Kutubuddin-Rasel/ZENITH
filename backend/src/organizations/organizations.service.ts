/**
 * Organizations Service — Pure Organization CRUD.
 *
 * SRP REFACTOR (Step 3):
 * All invitation workflow logic extracted to InvitationService.
 * This service now implements IOrganizationReader & IOrganizationWriter
 * and handles ONLY organizational lifecycle.
 *
 * @see InvitationService for invitation workflow
 * @see OrganizationSettingsService for tenant customization
 */

import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationRepository } from './repositories/abstract/organization.repository.abstract';
import {
  IOrganizationReader,
  IOrganizationWriter,
} from './interfaces/organization.interfaces';

@Injectable()
export class OrganizationsService
  implements IOrganizationReader, IOrganizationWriter
{
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly organizationsRepository: OrganizationRepository,
  ) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const slug = dto.slug || this.generateSlug(dto.name);
    const existing = await this.organizationsRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException('Organization with this name already exists');
    }
    const organization = await this.organizationsRepository.create({
      name: dto.name,
      slug,
    });
    return this.organizationsRepository.save(organization);
  }

  async findOne(id: string): Promise<Organization | null> {
    return this.organizationsRepository.findOne(id);
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return this.organizationsRepository.findBySlug(slug);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
