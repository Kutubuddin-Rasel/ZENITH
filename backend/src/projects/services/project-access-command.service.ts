import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { ProjectAccessSettingsRepository } from '../../database/repositories/project-access-settings.repository';

import {
  AUDIT_LOG_WRITER_TOKEN,
  PROJECT_ACCESS_QUERY_TOKEN,
  PROJECT_QUERY_TOKEN,
} from '../constants/projects.tokens';
import { ProjectAccessSettings } from '../entities/project-access-settings.entity';
import type {
  IAuditLogWriter,
  IProjectAccessCommand,
  IProjectAccessQuery,
  IProjectQuery,
  ProjectAccessView,
  UpdateAccessSettingsCommand,
} from '../interfaces/projects.interfaces';

/**
 * ProjectAccessCommandService
 *
 * Write-side surface for `ProjectAccessSettings`. Bound to
 * `PROJECT_ACCESS_COMMAND_TOKEN`. Single responsibility: merge a
 * patch onto the row, persist, audit.
 *
 * Audit severity is `HIGH` because access-policy changes alter
 * trust-boundary enforcement (IP allowlist, geographic filtering,
 * default deny/allow). Each `metadata.changedSettings` entry lists
 * the exact field set that was patched so reviewers can scope the
 * post-mortem.
 */
@Injectable()
export class ProjectAccessCommandService implements IProjectAccessCommand {
  constructor(
    @Inject(PROJECT_QUERY_TOKEN)
    private readonly projects: IProjectQuery,
    @Inject(PROJECT_ACCESS_QUERY_TOKEN)
    private readonly accessQuery: IProjectAccessQuery,
    private readonly settingsRepo: ProjectAccessSettingsRepository,
    @Inject(AUDIT_LOG_WRITER_TOKEN)
    private readonly auditWriter: IAuditLogWriter,
    private readonly cls: ClsService,
  ) {}

  async updateAccessSettings(
    projectId: string,
    patch: UpdateAccessSettingsCommand,
  ): Promise<ProjectAccessView> {
    const project = await this.projects.findById(projectId);

    const existing =
      (await this.settingsRepo.findByProject(projectId)) ??
      this.settingsRepo.create({ projectId });

    const merged = this.mergePatch(existing, patch);
    const saved = await this.settingsRepo.save(merged);

    await this.auditWriter.log({
      tenantId: project.organizationId ?? 'unknown',
      actorId: this.safeClsGet('userId') ?? 'system',
      resourceType: 'ProjectAccessSettings',
      resourceId: saved.id,
      actionType: 'UPDATE',
      action: 'ACCESS_SETTINGS_UPDATED',
      projectId,
      severity: 'HIGH',
      metadata: {
        projectName: project.name,
        changedSettings: Object.keys(patch),
        newValues: patch as Record<string, unknown>,
      },
    });

    return this.toView(saved);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mergePatch(
    entity: ProjectAccessSettings,
    patch: UpdateAccessSettingsCommand,
  ): ProjectAccessSettings {
    const mutable = entity;
    if (patch.accessControlEnabled !== undefined)
      mutable.accessControlEnabled = patch.accessControlEnabled;
    if (patch.defaultPolicy !== undefined)
      mutable.defaultPolicy = patch.defaultPolicy;
    if (patch.ipAllowlist !== undefined)
      mutable.ipAllowlist = [...patch.ipAllowlist];
    if (patch.countryAllowlist !== undefined)
      mutable.countryAllowlist = [...patch.countryAllowlist];
    if (patch.geographicFiltering !== undefined)
      mutable.geographicFiltering = patch.geographicFiltering;
    if (patch.timeBasedFiltering !== undefined)
      mutable.timeBasedFiltering = patch.timeBasedFiltering;
    if (patch.emergencyAccessEnabled !== undefined)
      mutable.emergencyAccessEnabled = patch.emergencyAccessEnabled;
    if (patch.userSpecificRules !== undefined)
      mutable.userSpecificRules = patch.userSpecificRules;
    if (patch.roleBasedRules !== undefined)
      mutable.roleBasedRules = patch.roleBasedRules;
    if (patch.maxRulesPerUser !== undefined)
      mutable.maxRulesPerUser = patch.maxRulesPerUser;
    if (patch.autoCleanupEnabled !== undefined)
      mutable.autoCleanupEnabled = patch.autoCleanupEnabled;
    if (patch.cleanupIntervalHours !== undefined)
      mutable.cleanupIntervalHours = patch.cleanupIntervalHours;
    if (patch.notificationEnabled !== undefined)
      mutable.notificationEnabled = patch.notificationEnabled;
    if (patch.logAllAccess !== undefined)
      mutable.logAllAccess = patch.logAllAccess;
    if (patch.requireApprovalForNewRules !== undefined)
      mutable.requireApprovalForNewRules = patch.requireApprovalForNewRules;
    return mutable;
  }

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

  private safeClsGet(key: string): string | undefined {
    try {
      const value = this.cls.get<string>(key);
      return value || undefined;
    } catch {
      return undefined;
    }
  }
}
