import { Inject, Injectable } from '@nestjs/common';

import { ProjectAccessSettingsRepository } from '../../database/repositories/project-access-settings.repository';

import { PROJECT_QUERY_TOKEN } from '../constants/projects.tokens';
import { ProjectAccessSettings } from '../entities/project-access-settings.entity';
import type {
  IProjectAccessQuery,
  IProjectQuery,
  ProjectAccessView,
} from '../interfaces/projects.interfaces';

/**
 * ProjectAccessQueryService
 *
 * Read-side surface for `ProjectAccessSettings`. Bound to
 * `PROJECT_ACCESS_QUERY_TOKEN`. Lazy-create semantics: if no settings
 * row exists for the project, a default row is persisted and returned
 * (mirrors the legacy behaviour the access-control middleware relies
 * on).
 *
 * Tenant validation
 * -----------------
 * The settings row is keyed by `projectId` (1:1 with `Project`). To
 * prevent cross-tenant disclosure, every read MUST first resolve the
 * project via `IProjectQuery.findById` — which delegates to the
 * tenant-aware repository wrapper and throws `NotFoundException`
 * outside the caller's organization. Only after that gate succeeds
 * may the settings row be returned.
 */
@Injectable()
export class ProjectAccessQueryService implements IProjectAccessQuery {
  constructor(
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projects: IProjectQuery,
    private readonly settingsRepo: ProjectAccessSettingsRepository,
  ) {}

  async getAccessSettings(projectId: string): Promise<ProjectAccessView> {
    await this.projects.findById(projectId);

    let settings = await this.settingsRepo.findByProject(projectId);
    if (!settings) {
      settings = this.settingsRepo.create({ projectId });
      settings = await this.settingsRepo.save(settings);
    }

    return this.toView(settings);
  }

  // ---------------------------------------------------------------------------
  // Internal — DTO projection
  // ---------------------------------------------------------------------------

  private toView(entity: ProjectAccessSettings): ProjectAccessView {
    return {
      id: entity.id,
      projectId: entity.projectId,
      accessControlEnabled: entity.accessControlEnabled,
      defaultPolicy: entity.defaultPolicy,
      ipAllowlist: entity.ipAllowlist ?? [],
      countryAllowlist: entity.countryAllowlist ?? [],
      geographicFiltering: entity.geographicFiltering,
      timeBasedFiltering: entity.timeBasedFiltering,
      emergencyAccessEnabled: entity.emergencyAccessEnabled,
      userSpecificRules: entity.userSpecificRules,
      roleBasedRules: entity.roleBasedRules,
      maxRulesPerUser: entity.maxRulesPerUser,
      autoCleanupEnabled: entity.autoCleanupEnabled,
      cleanupIntervalHours: entity.cleanupIntervalHours,
      notificationEnabled: entity.notificationEnabled,
      logAllAccess: entity.logAllAccess,
      requireApprovalForNewRules: entity.requireApprovalForNewRules,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
