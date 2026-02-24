/**
 * AI Consent Guard — Organization-Level AI Opt-In Check
 *
 * Checks whether the authenticated user's organization has opted into AI
 * features before allowing access to AI endpoints. This ensures compliance
 * with organizational policies regarding external AI data processing.
 *
 * PERFORMANCE:
 *   Database lookup is cached in Redis with 5-minute TTL via CacheService.
 *   First request per org pays ~5ms DB cost; subsequent requests hit cache.
 *   Cache key: org:ai-consent:{organizationId}
 *
 * FAIL-OPEN on missing organizationId:
 *   Some endpoints (e.g., superadmin) may not have an organizationId.
 *   If organizationId is missing from JWT, the guard allows the request
 *   and trusts upstream guards (JwtAuthGuard, ProjectRoleGuard) to handle
 *   authorization. This prevents locking out admin operations.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { CacheService } from '../../cache/cache.service';

/** Redis namespace for AI consent flags. */
const CONSENT_NAMESPACE = 'org';

/** TTL for cached consent flags (5 minutes in seconds). */
const CONSENT_TTL_SECONDS = 300;

/** Shape of the user object attached to authenticated requests. */
interface AuthenticatedUser {
  userId: string;
  organizationId?: string;
}

@Injectable()
export class AIConsentGuard implements CanActivate {
  private readonly logger = new Logger(AIConsentGuard.name);

  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    const organizationId = request.user?.organizationId;

    // If no organizationId in JWT, skip consent check.
    // Upstream guards (JwtAuthGuard, ProjectRoleGuard) handle auth.
    if (!organizationId) {
      return true;
    }

    const aiEnabled = await this.isAIEnabled(organizationId);

    if (!aiEnabled) {
      this.logger.warn(
        `AI access denied for organization ${organizationId}: AI features disabled`,
      );
      throw new ForbiddenException(
        'AI features are disabled for your organization. Please enable them in settings.',
      );
    }

    return true;
  }

  /**
   * Check if AI is enabled for the given organization.
   *
   * Lookup order:
   *   1. Redis cache (fast path, < 1ms)
   *   2. Database (slow path, ~5ms, result cached for 5 minutes)
   *
   * If the organization is not found, default to true (fail-open for
   * newly created orgs before settings are configured).
   */
  private async isAIEnabled(organizationId: string): Promise<boolean> {
    const cacheKey = `ai-consent:${organizationId}`;

    // 1. Check Redis cache
    const cached = await this.cacheService.get<string>(cacheKey, {
      namespace: CONSENT_NAMESPACE,
    });

    if (cached !== null && cached !== undefined) {
      return cached === 'true';
    }

    // 2. Cache miss — query database
    try {
      const org = await this.orgRepo.findOne({
        where: { id: organizationId },
        select: ['id', 'aiEnabled'],
      });

      // Default to true if org not found (fail-open for edge cases)
      const enabled = org?.aiEnabled ?? true;

      // Cache the result for 5 minutes
      await this.cacheService.set(cacheKey, String(enabled), {
        namespace: CONSENT_NAMESPACE,
        ttl: CONSENT_TTL_SECONDS,
      });

      return enabled;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to check AI consent for org ${organizationId}: ${message} — failing open`,
      );
      // Fail-open: don't block AI on transient DB errors
      return true;
    }
  }
}
