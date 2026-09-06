import { Inject, Injectable } from '@nestjs/common';

import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import type { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { ProjectSecurityPolicyRepository } from '../../database/repositories/project-security-policy.repository';

import { ProjectSecurityPolicy } from '../entities/project-security-policy.entity';

/**
 * Patch shape accepted by `update` — narrowed projection of the
 * mutable columns on `ProjectSecurityPolicy`. Mirrors the existing
 * `UpdateProjectSecurityPolicyDto` HTTP shape so the controller can
 * forward the body without re-mapping.
 */
export interface UpdateSecurityPolicyPatch {
  require2FA?: boolean;
  requirePasswordMinLength?: number;
  requirePasswordComplexity?: boolean;
  passwordMaxAgeDays?: number;
  maxSessionTimeoutMinutes?: number;
  enforceSessionTimeout?: boolean;
  requireIPAllowlist?: boolean;
  blockedCountries?: string[];
  notifyOnPolicyViolation?: boolean;
  notifyOnAccessDenied?: boolean;
}

/**
 * ProjectSecurityPolicyCommandService
 *
 * Write surface for `ProjectSecurityPolicy`. Intentionally NOT bound
 * behind an ISP token — the sole consumer today is
 * `ProjectSecurityPolicyController`, which lives inside the same
 * module, so direct injection is fine.
 *
 * Why split from the query service
 * --------------------------------
 * `IProjectSecurityPolicyQuery` is exposed to external guards
 * (`auth/guards/project-security-policy.guard.ts`) and MUST stay
 * narrow (just `getPolicy` / `hasActiveRequirements`). The write
 * methods (`getOrCreate`, `update`) would expand the token surface for
 * every guard consumer without benefit. Splitting keeps both surfaces
 * single-purpose (ISP).
 *
 * Cache invalidation contract
 * ---------------------------
 * Every write MUST invalidate the same key the query service caches
 * under: `project:{projectId}:security-policy`. The query service's
 * 30-second TTL is short, but stale-on-write is unacceptable for a
 * policy that gates auth requirements.
 */
@Injectable()
export class ProjectSecurityPolicyCommandService {
  constructor(
    private readonly policyRepo: ProjectSecurityPolicyRepository,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  /**
   * Resolve the project's policy, creating defaults on first access.
   * Used by the `GET /projects/:id/security-policy` route which must
   * always return a row (the UI binds against a non-null shape).
   */
  async getOrCreate(projectId: string): Promise<ProjectSecurityPolicy> {
    let policy = await this.policyRepo.findByProject(projectId);
    if (!policy) {
      policy = this.policyRepo.create({
        projectId,
        require2FA: false,
        requirePasswordMinLength: 8,
        requirePasswordComplexity: false,
        passwordMaxAgeDays: 0,
        maxSessionTimeoutMinutes: 480,
        enforceSessionTimeout: false,
        requireIPAllowlist: false,
        blockedCountries: [],
        notifyOnPolicyViolation: true,
        notifyOnAccessDenied: true,
      });
      policy = await this.policyRepo.save(policy);
    }
    return policy;
  }

  /**
   * Apply a patch to the project's policy. Persists the `updatedById`
   * stamp and invalidates the read-side cache.
   */
  async update(
    projectId: string,
    userId: string,
    patch: UpdateSecurityPolicyPatch,
  ): Promise<ProjectSecurityPolicy> {
    const policy = await this.getOrCreate(projectId);

    Object.assign(policy, patch);
    policy.updatedById = userId;

    const saved = await this.policyRepo.save(policy);

    await this.cacheStore.del(this.cacheKey(projectId));

    return saved;
  }

  private cacheKey(projectId: string): string {
    return `project:${projectId}:security-policy`;
  }
}
