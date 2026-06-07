import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IPAccessRule } from '../entities/ip-access-rule.entity';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { AccessRuleRepository } from '../repositories/abstract/access-rule.repository';
import {
  CacheStatsSnapshot,
  IAccessRuleCache,
} from '../interfaces/access-control.interfaces';
import { CACHE_CONFIG } from '../constants/access-control.cache';
import { AccessRuleL1Cache } from './access-rule-l1-cache';

@Injectable()
export class AccessRuleCacheService
  extends IAccessRuleCache
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccessRuleCacheService.name);

  constructor(
    private readonly accessRuleRepo: AccessRuleRepository,
    private readonly l1: AccessRuleL1Cache,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(
      'AccessRuleCacheService initializing with multi-tenant L1/L2 caching...',
    );
    try {
      await this.getTenantRules(CACHE_CONFIG.KEYS.GLOBAL_RULES, null, [
        'global-rules',
      ]);
      this.logger.log(
        'Global access control rules cache pre-warmed successfully',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to pre-warm cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.l1.clear();
    this.logger.log('AccessRuleCacheService L1 cache cleared');
  }

  // --- Public read path -----------------------------------------------------

  async getMergedRules(organizationId?: string): Promise<IPAccessRule[]> {
    if (!organizationId) {
      this.logger.debug(
        'No organization context - returning global rules only',
      );
      return this.getTenantRules(CACHE_CONFIG.KEYS.GLOBAL_RULES, null, [
        'global-rules',
      ]);
    }

    const mergedCacheKey = `${CACHE_CONFIG.KEYS.MERGED_RULES_PREFIX}${organizationId}`;

    // Merged cache hit does NOT count as a DB query — leaf reads do.
    const cached = await this.readCounted(mergedCacheKey);
    if (cached !== null) {
      return cached;
    }

    const [globalRules, orgRules] = await Promise.all([
      this.getTenantRules(CACHE_CONFIG.KEYS.GLOBAL_RULES, null, [
        'global-rules',
      ]),
      this.getTenantRules(
        `${CACHE_CONFIG.KEYS.ORG_RULES_PREFIX}${organizationId}`,
        organizationId,
        [`org-${organizationId}`],
      ),
    ]);

    const mergedRules = [...globalRules, ...orgRules].sort(
      (a, b) => b.priority - a.priority,
    );

    await this.populateCaches(mergedCacheKey, mergedRules, [
      'global-rules',
      `org-${organizationId}`,
    ]);

    return mergedRules;
  }

  async getEmergencyRules(organizationId?: string): Promise<IPAccessRule[]> {
    const cacheKey = organizationId
      ? `${CACHE_CONFIG.KEYS.EMERGENCY_RULES}:${organizationId}`
      : CACHE_CONFIG.KEYS.EMERGENCY_RULES;

    let emergencyRules: IPAccessRule[] | undefined = this.l1.get(cacheKey);

    if (emergencyRules === undefined) {
      try {
        const l2Result = await this.cacheStore.get<IPAccessRule[]>(cacheKey, {
          namespace: CACHE_CONFIG.NAMESPACE,
        });
        if (l2Result !== null) {
          emergencyRules = l2Result;
          this.l1.set(cacheKey, l2Result);
        }
      } catch {
        // Ignore
      }

      if (emergencyRules === undefined) {
        emergencyRules = await this.accessRuleRepo.findEmergencyRules(
          organizationId ?? null,
        );
        try {
          await this.cacheStore.set(cacheKey, emergencyRules, {
            namespace: CACHE_CONFIG.NAMESPACE,
            ttl: CACHE_CONFIG.L2_TTL_SECONDS,
            tags: ['access-control-rules', 'emergency-rules'],
          });
        } catch {
          // Ignore
        }
        this.l1.set(cacheKey, emergencyRules);
      }
    }

    return emergencyRules;
  }

  // --- Read-through helpers -------------------------------------------------

  /**
   * Read-through for a single tenant scope (global = null, or org UUID).
   * Counts a DB query on full miss, mirroring legacy getGlobalRules/getOrgRules.
   */
  private async getTenantRules(
    cacheKey: string,
    organizationId: string | null,
    tags: string[],
  ): Promise<IPAccessRule[]> {
    const cached = await this.readCounted(cacheKey);
    if (cached !== null) {
      return cached;
    }

    this.l1.counters.dbQueries++;
    const activeRules = await this.accessRuleRepo.findActiveForTenant(
      organizationId,
      new Date(),
    );
    await this.populateCaches(cacheKey, activeRules, tags);
    return activeRules;
  }

  /** L1→L2 read with hit/miss accounting; null on full miss (no DB count). */
  private async readCounted(cacheKey: string): Promise<IPAccessRule[] | null> {
    const l1Result = this.l1.get(cacheKey);
    if (l1Result !== undefined) {
      this.l1.counters.l1Hits++;
      return l1Result;
    }
    this.l1.counters.l1Misses++;

    try {
      const l2Result = await this.cacheStore.get<IPAccessRule[]>(cacheKey, {
        namespace: CACHE_CONFIG.NAMESPACE,
      });
      if (l2Result !== null) {
        this.l1.counters.l2Hits++;
        this.l1.set(cacheKey, l2Result);
        return l2Result;
      }
    } catch (error) {
      this.logger.warn(
        `L2 cache read failed for ${cacheKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
    this.l1.counters.l2Misses++;
    return null;
  }

  private async populateCaches(
    key: string,
    data: IPAccessRule[],
    tags: string[],
  ): Promise<void> {
    this.l1.set(key, data);
    try {
      await this.cacheStore.set(key, data, {
        namespace: CACHE_CONFIG.NAMESPACE,
        ttl: CACHE_CONFIG.L2_TTL_SECONDS,
        tags: ['access-control-rules', ...tags],
      });
    } catch (error) {
      this.logger.warn(
        `L2 cache write failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // --- Monitoring -----------------------------------------------------------

  getStats(): CacheStatsSnapshot {
    const c = this.l1.counters;
    const l1Total = c.l1Hits + c.l1Misses;
    const l2Total = c.l2Hits + c.l2Misses;

    return {
      l1: { size: this.l1.size, maxSize: CACHE_CONFIG.L1_MAX_SIZE },
      stats: { ...c },
      hitRates: {
        l1: l1Total > 0 ? `${((c.l1Hits / l1Total) * 100).toFixed(1)}%` : '0%',
        l2: l2Total > 0 ? `${((c.l2Hits / l2Total) * 100).toFixed(1)}%` : '0%',
      },
    };
  }

  clear(): void {
    this.l1.clear();
  }
}
