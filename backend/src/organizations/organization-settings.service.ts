/**
 * Organization Settings Service
 *
 * ARCHITECTURE:
 * Follows the same "getOrCreate + update" pattern as UserSecuritySettingsService.
 * Settings are lazily created on first access with sensible defaults.
 * This avoids migration backfill — no existing orgs need a settings row.
 *
 * DOMAIN HELPER:
 * isEmailDomainAllowed() is exposed for OrganizationsService to enforce
 * domain restrictions during invite creation.
 *
 * @see UserSecuritySettingsService for the pattern reference
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OrganizationSettings,
  ProjectVisibility,
} from './entities/organization-settings.entity';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

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

  constructor(
    @InjectRepository(OrganizationSettings)
    private readonly settingsRepo: Repository<OrganizationSettings>,
  ) {}

  // ===========================================================================
  // GET OR CREATE (Lazy Initialization)
  // ===========================================================================

  /**
   * Get organization settings, creating default settings if none exist.
   *
   * PATTERN: Lazy initialization — avoids migration backfill.
   * First access for an org creates a default row.
   *
   * @param organizationId - UUID of the organization
   * @returns OrganizationSettings (existing or newly created)
   */
  async getOrCreate(organizationId: string): Promise<OrganizationSettings> {
    let settings = await this.settingsRepo.findOne({
      where: { organizationId },
    });

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

  /**
   * Update organization settings with partial data.
   *
   * VALIDATION: DTO validators handle type/range checks.
   * This method handles the merge + save.
   *
   * @param organizationId - UUID of the organization
   * @param dto - Partial settings update
   * @returns Updated OrganizationSettings
   */
  async update(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
  ): Promise<OrganizationSettings> {
    const settings = await this.getOrCreate(organizationId);

    // Apply only the fields that were provided
    if (dto.logoUrl !== undefined) settings.logoUrl = dto.logoUrl;
    if (dto.timezone !== undefined) settings.timezone = dto.timezone;
    if (dto.defaultProjectVisibility !== undefined) {
      settings.defaultProjectVisibility = dto.defaultProjectVisibility;
    }
    if (dto.allowedEmailDomains !== undefined) {
      // Normalize: lowercase, deduplicate
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

  /**
   * Check if an email is allowed by the organization's domain restrictions.
   *
   * RULES:
   * - Empty allowedEmailDomains = all emails allowed (no restriction)
   * - Non-empty = email domain must match one of the allowed domains
   *
   * @param organizationId - UUID of the organization
   * @param email - Email address to check
   * @returns true if the email is allowed
   */
  async isEmailDomainAllowed(
    organizationId: string,
    email: string,
  ): Promise<boolean> {
    const settings = await this.getOrCreate(organizationId);

    // No restrictions configured — all emails allowed
    if (settings.allowedEmailDomains.length === 0) {
      return true;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (!emailDomain) {
      return false; // Malformed email
    }

    return settings.allowedEmailDomains.includes(emailDomain);
  }
}
