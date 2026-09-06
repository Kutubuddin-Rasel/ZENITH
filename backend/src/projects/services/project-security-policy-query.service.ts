import { Inject, Injectable } from '@nestjs/common';

import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { ProjectSecurityPolicyRepository } from '../../database/repositories/project-security-policy.repository';

import { ProjectSecurityPolicy } from '../entities/project-security-policy.entity';
import type {
  IProjectSecurityPolicyQuery,
  ProjectSecurityPolicyView,
} from '../interfaces/projects.interfaces';

/**
 * ProjectSecurityPolicyQueryService
 *
 * Read-side surface for `ProjectSecurityPolicy`. Bound to
 * `PROJECT_SECURITY_POLICY_TOKEN`. Sole external consumer is
 * `ProjectSecurityPolicyGuard` — every hot-path request hits this
 * service, so the cache layer is non-negotiable.
 *
 * Cache strategy
 * --------------
 * - 30-second TTL (matches the legacy guard's "in-memory map" cache
 *   contract). Short enough that policy edits propagate within a
 *   request lifetime, long enough that high-RPS routes don't melt the
 *   primary DB.
 * - Keyed by `project:{projectId}:security-policy`. The
 *   `ProjectSecurityPolicyCommandService.update` path invalidates by
 *   the same key after a successful write.
 * - `Date` columns are serialized to ISO strings by Redis JSON
 *   coercion; the hydrator restores them before returning the view.
 */
@Injectable()
export class ProjectSecurityPolicyQueryService implements IProjectSecurityPolicyQuery {
  private static readonly CACHE_TTL_SECONDS = 30;

  constructor(
    private readonly policyRepo: ProjectSecurityPolicyRepository,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  async getPolicy(
    projectId: string,
  ): Promise<ProjectSecurityPolicyView | null> {
    const cacheKey = this.cacheKey(projectId);

    const cached =
      await this.cacheStore.get<SerializedSecurityPolicy>(cacheKey);
    if (cached) {
      return this.hydrateView(cached);
    }

    const policy = await this.policyRepo.findByProject(projectId);
    if (!policy) {
      return null;
    }

    await this.cacheStore.set(cacheKey, this.toSerialized(policy), {
      ttl: ProjectSecurityPolicyQueryService.CACHE_TTL_SECONDS,
    });

    return this.toView(policy);
  }

  async hasActiveRequirements(projectId: string): Promise<boolean> {
    const policy = await this.getPolicy(projectId);
    if (!policy) {
      return false;
    }
    return (
      policy.require2FA ||
      policy.requirePasswordComplexity ||
      policy.enforceSessionTimeout ||
      policy.requireIPAllowlist ||
      policy.blockedCountries.length > 0
    );
  }

  // ---------------------------------------------------------------------------
  // Private — DTO/cache mapping
  // ---------------------------------------------------------------------------

  private cacheKey(projectId: string): string {
    return `project:${projectId}:security-policy`;
  }

  private toView(entity: ProjectSecurityPolicy): ProjectSecurityPolicyView {
    return {
      id: entity.id,
      projectId: entity.projectId,
      require2FA: entity.require2FA,
      requirePasswordMinLength: entity.requirePasswordMinLength,
      requirePasswordComplexity: entity.requirePasswordComplexity,
      passwordMaxAgeDays: entity.passwordMaxAgeDays,
      maxSessionTimeoutMinutes: entity.maxSessionTimeoutMinutes,
      enforceSessionTimeout: entity.enforceSessionTimeout,
      requireIPAllowlist: entity.requireIPAllowlist,
      blockedCountries: entity.blockedCountries ?? [],
      notifyOnPolicyViolation: entity.notifyOnPolicyViolation,
      notifyOnAccessDenied: entity.notifyOnAccessDenied,
      updatedById: entity.updatedById ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toSerialized(
    entity: ProjectSecurityPolicy,
  ): SerializedSecurityPolicy {
    return {
      id: entity.id,
      projectId: entity.projectId,
      require2FA: entity.require2FA,
      requirePasswordMinLength: entity.requirePasswordMinLength,
      requirePasswordComplexity: entity.requirePasswordComplexity,
      passwordMaxAgeDays: entity.passwordMaxAgeDays,
      maxSessionTimeoutMinutes: entity.maxSessionTimeoutMinutes,
      enforceSessionTimeout: entity.enforceSessionTimeout,
      requireIPAllowlist: entity.requireIPAllowlist,
      blockedCountries: entity.blockedCountries ?? [],
      notifyOnPolicyViolation: entity.notifyOnPolicyViolation,
      notifyOnAccessDenied: entity.notifyOnAccessDenied,
      updatedById: entity.updatedById ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private hydrateView(
    cached: SerializedSecurityPolicy,
  ): ProjectSecurityPolicyView {
    return {
      id: cached.id,
      projectId: cached.projectId,
      require2FA: cached.require2FA,
      requirePasswordMinLength: cached.requirePasswordMinLength,
      requirePasswordComplexity: cached.requirePasswordComplexity,
      passwordMaxAgeDays: cached.passwordMaxAgeDays,
      maxSessionTimeoutMinutes: cached.maxSessionTimeoutMinutes,
      enforceSessionTimeout: cached.enforceSessionTimeout,
      requireIPAllowlist: cached.requireIPAllowlist,
      blockedCountries: cached.blockedCountries,
      notifyOnPolicyViolation: cached.notifyOnPolicyViolation,
      notifyOnAccessDenied: cached.notifyOnAccessDenied,
      updatedById: cached.updatedById,
      createdAt: new Date(cached.createdAt),
      updatedAt: new Date(cached.updatedAt),
    };
  }
}

/**
 * Cache-shape projection — Date columns are stored as ISO strings.
 */
interface SerializedSecurityPolicy {
  id: string;
  projectId: string;
  require2FA: boolean;
  requirePasswordMinLength: number;
  requirePasswordComplexity: boolean;
  passwordMaxAgeDays: number;
  maxSessionTimeoutMinutes: number;
  enforceSessionTimeout: boolean;
  requireIPAllowlist: boolean;
  blockedCountries: string[];
  notifyOnPolicyViolation: boolean;
  notifyOnAccessDenied: boolean;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}
