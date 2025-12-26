import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSecurityPolicy } from './entities/project-security-policy.entity';

@Injectable()
export class ProjectSecurityPolicyService {
  // Request-scoped cache to avoid repeated DB hits
  private policyCache: Map<
    string,
    { policy: ProjectSecurityPolicy; timestamp: number }
  > = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  constructor(
    @InjectRepository(ProjectSecurityPolicy)
    private readonly policyRepo: Repository<ProjectSecurityPolicy>,
  ) {}

  /**
   * Get or create security policy for a project
   */
  async getOrCreate(projectId: string): Promise<ProjectSecurityPolicy> {
    // Check cache first
    const cached = this.policyCache.get(projectId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.policy;
    }

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

    // Cache the policy
    this.policyCache.set(projectId, { policy, timestamp: Date.now() });

    return policy;
  }

  /**
   * Update project security policy
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

    // Invalidate cache
    this.policyCache.delete(projectId);

    return saved;
  }

  /**
   * Get policy (with caching) - for guard usage
   */
  async getPolicy(projectId: string): Promise<ProjectSecurityPolicy | null> {
    // Check cache first
    const cached = this.policyCache.get(projectId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.policy;
    }

    const policy = await this.policyRepo.findOne({
      where: { projectId },
    });

    if (policy) {
      this.policyCache.set(projectId, { policy, timestamp: Date.now() });
    }

    return policy;
  }

  /**
   * Clear cache for a project (call after updates)
   */
  invalidateCache(projectId: string): void {
    this.policyCache.delete(projectId);
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
