/**
 * Organization Settings Service
 *
 * DIP REFACTOR (Step 2): @InjectRepository replaced with
 * OrganizationSettingsRepository abstract class.
 *
 * ARCHITECTURE:
 * Follows the "getOrCreate + update" pattern. Settings are lazily
 * created on first access with sensible defaults.
 *
 * @see UserSecuritySettingsService for the pattern reference
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  OrganizationSettings,
  ProjectVisibility,
} from './entities/organization-settings.entity';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { OrganizationSettingsRepository } from './repositories/abstract/organization-settings.repository.abstract';

// =============================================================================
// DEFAULTS
// =============================================================================

/** Default settings applied when creating a new OrganizationSettings row */
const ORGANIZATION_SETTINGS_DEFAULTS: Omit<
  OrganizationSettings,
  'id' | 'organizationId' | 'organization' | 'createdAt' | 'updatedAt'
> = {
  logoUrl: null,
  timezone: 'UTC',
  defaultProjectVisibility: ProjectVisibility.PRIVATE,
  allowedEmailDomains: [],
  maxMembers: 50,
} as const;

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name);

  constructor(private readonly settingsRepo: OrganizationSettingsRepository) {}

  // ===========================================================================
  // GET OR CREATE (Lazy Initialization)
  // ===========================================================================

  async getOrCreate(organizationId: string): Promise<OrganizationSettings> {
    let settings = await this.settingsRepo.findOne(organizationId);

    if (!settings) {
      this.logger.log(
        `Creating default settings for organization ${organizationId}`,
      );

      settings = this.settingsRepo.create({
        organizationId,
        ...ORGANIZATION_SETTINGS_DEFAULTS,
      });
      await this.settingsRepo.save(settings);
    }

    return settings;
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  async update(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreate(organizationId);

    if (dto.logoUrl !== undefined) settings.logoUrl = dto.logoUrl;
    if (dto.timezone !== undefined) settings.timezone = dto.timezone;
    if (dto.defaultProjectVisibility !== undefined) {
      settings.defaultProjectVisibility = dto.defaultProjectVisibility;
    }
    if (dto.allowedEmailDomains !== undefined) {
      settings.allowedEmailDomains = [
        ...new Set(dto.allowedEmailDomains.map((d) => d.toLowerCase())),
      ];
    }
    if (dto.maxMembers !== undefined) settings.maxMembers = dto.maxMembers;

    return this.settingsRepo.save(settings);
  }

  // ===========================================================================
  // DOMAIN HELPERS (Used by OrganizationsService)
  // ===========================================================================

  async isEmailDomainAllowed(
    organizationId: string,
    email: string,
  ): Promise<boolean> {
    const settings = await this.getOrCreate(organizationId);

    if (settings.allowedEmailDomains.length === 0) {
      return true;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) {
      return false;
    }

    return settings.allowedEmailDomains.includes(emailDomain);
  }
}
