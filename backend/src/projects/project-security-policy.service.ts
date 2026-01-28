import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSecurityPolicy } from './entities/project-security-policy.entity';
import { CacheService } from '../cache/cache.service';

/**
 * Cached representation of ProjectSecurityPolicy.
 * Date fields are serialized as strings in Redis.
 */
interface CachedSecurityPolicy {
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
  createdAt: string; // Date serialized as ISO string
  updatedAt: string; // Date serialized as ISO string
}

@Injectable()
export class ProjectSecurityPolicyService {
  private readonly CACHE_TTL = 30; // Redis TTL in seconds

  constructor(
    @InjectRepository(ProjectSecurityPolicy)
    private readonly policyRepo: Repository<ProjectSecurityPolicy>,
    private readonly cacheService: CacheService,
  ) { }

  /**
   * Build cache key for project policy
   */
  private getCacheKey(projectId: string): string {
    return `project:${projectId}:security-policy`;
  }

  /**
   * Reconstruct Date fields after Redis deserialization
   */
  private hydrateDates(
    cached: CachedSecurityPolicy,
  ): ProjectSecurityPolicy {
    return {
      ...cached,
      createdAt: new Date(cached.createdAt),
      updatedAt: new Date(cached.updatedAt),
    } as ProjectSecurityPolicy;
  }

  /**
   * Get or create security policy for a project
   * CACHE-ASIDE: Check Redis → miss → DB fetch → cache set
   */
  async getOrCreate(projectId: string): Promise<ProjectSecurityPolicy> {
    const cacheKey = this.getCacheKey(projectId);

    // Check cache first
    const cached =
      await this.cacheService.get<CachedSecurityPolicy>(cacheKey);
    if (cached) {
      return this.hydrateDates(cached);
    }

    // Cache miss: fetch from DB
    let policy = await this.policyRepo.findOne({
      where: { projectId },
    });

    if (!policy) {
      // Create with defaults
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
      await this.policyRepo.save(policy);
    }

    // Cache the policy (CacheService handles JSON serialization)
    await this.cacheService.set(cacheKey, policy, { ttl: this.CACHE_TTL });

    return policy;
  }

  /**
   * Update project security policy
   * CACHE-ASIDE: DB update → cache invalidate (delete, not set)
   */
  async update(
    projectId: string,
    userId: string,
    updates: Partial<
      Omit<
        ProjectSecurityPolicy,
        'id' | 'projectId' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<ProjectSecurityPolicy> {
    const policy = await this.getOrCreate(projectId);

    // Apply updates
    Object.assign(policy, updates);
    policy.updatedById = userId;

    const saved = await this.policyRepo.save(policy);

    // Invalidate cache (next read will re-fetch)
    await this.cacheService.del(this.getCacheKey(projectId));

    return saved;
  }

  /**
   * Get policy (with caching) - for guard usage
   * CACHE-ASIDE: Check Redis → miss → DB fetch → cache set
   */
  async getPolicy(projectId: string): Promise<ProjectSecurityPolicy | null> {
    const cacheKey = this.getCacheKey(projectId);

    // Check cache first
    const cached =
      await this.cacheService.get<CachedSecurityPolicy>(cacheKey);
    if (cached) {
      return this.hydrateDates(cached);
    }

    // Cache miss: fetch from DB
    const policy = await this.policyRepo.findOne({
      where: { projectId },
    });

    if (policy) {
      await this.cacheService.set(cacheKey, policy, { ttl: this.CACHE_TTL });
    }

    return policy;
  }

  /**
   * Clear cache for a project (call after updates)
   * DISTRIBUTED: Uses Redis instead of local Map
   */
  async invalidateCache(projectId: string): Promise<void> {
    await this.cacheService.del(this.getCacheKey(projectId));
  }

  /**
   * Check if a project has any active security requirements
   */
  async hasActiveRequirements(projectId: string): Promise<boolean> {
    const policy = await this.getPolicy(projectId);
    if (!policy) return false;

    return (
      policy.require2FA ||
      policy.requirePasswordComplexity ||
      policy.enforceSessionTimeout ||
      policy.requireIPAllowlist ||
      (policy.blockedCountries && policy.blockedCountries.length > 0)
    );
  }
}

