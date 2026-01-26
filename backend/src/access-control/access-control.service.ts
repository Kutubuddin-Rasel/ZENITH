import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { LRUCache } from 'lru-cache';
import {
  IPAccessRule,
  AccessRuleType,
  AccessRuleStatus,
  IPType,
} from './entities/ip-access-rule.entity';
import {
  AccessRuleHistory,
  HistoryAction,
} from './entities/access-rule-history.entity';
import { AuditService } from '../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../audit/entities/audit-log.entity';
import { CacheService } from '../cache/cache.service';
import * as geoip from 'geoip-lite';
import * as cron from 'node-cron';

// =============================================================================
// CACHE CONFIGURATION (Multi-Tenant Aware)
// =============================================================================

/**
 * Multi-Tenant Cache Strategy:
 *
 * Global Rules (organizationId = null):
 *   - Cached separately as they apply to ALL organizations
 *   - Key: "global-rules"
 *
 * Org-Specific Rules (organizationId = UUID):
 *   - Cached per-organization to ensure tenant isolation
 *   - Key: "org-rules:{organizationId}"
 *
 * Merged Rules (for access checks):
 *   - Combined global + org rules at runtime
 *   - Key: "merged-rules:{organizationId}" (or "merged-rules:global" for anonymous)
 */
const CACHE_CONFIG = {
  L1_TTL_MS: 5 * 1000, // 5 seconds
  L1_MAX_SIZE: 500, // Increased for multi-tenant support
  L2_TTL_SECONDS: 60, // 60 seconds
  NAMESPACE: 'access-control',
  KEYS: {
    GLOBAL_RULES: 'global-rules',
    ORG_RULES_PREFIX: 'org-rules:', // + organizationId
    MERGED_RULES_PREFIX: 'merged-rules:', // + organizationId or "global"
    EMERGENCY_RULES: 'emergency-rules',
    ALL_RULES_PREFIX: 'all-rules:', // + organizationId or "all"
  },
} as const;

/**
 * Event names for cache invalidation
 */
export const ACCESS_CONTROL_EVENTS = {
  RULES_CHANGED: 'access-control.rules-changed',
} as const;

// =============================================================================
// INTERFACES
// =============================================================================

export interface AccessCheckResult {
  allowed: boolean;
  reason: string;
  ruleId?: string;
  ruleName?: string;
  requiresApproval?: boolean;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IPLocation {
  country: string;
  region: string;
  city: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

export interface AccessAttempt {
  ipAddress: string;
  userId?: string;
  userAgent?: string;
  timestamp: Date;
  allowed: boolean;
  reason: string;
  ruleId?: string;
  location?: IPLocation;
  organizationId?: string;
}

interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  dbQueries: number;
}

/**
 * Rule change event payload for targeted cache invalidation
 */
interface RulesChangedEvent {
  ruleId?: string;
  organizationId?: string | null; // null = global rule changed
  action: 'created' | 'updated' | 'deleted' | 'expired-cleanup';
}

/**
 * Context for history tracking
 */
export interface HistoryContext {
  actorId?: string;
  actorIpAddress?: string;
  actorUserAgent?: string;
  reason?: string;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class AccessControlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessControlService.name);
  private readonly isEnabled: boolean;
  private readonly defaultPolicy: 'allow' | 'deny';
  private readonly emergencyAccessEnabled: boolean;

  // L1 Cache (In-Memory LRU) - supports multi-tenant keys
  private l1Cache: LRUCache<string, IPAccessRule[]>;

  // Cache statistics for monitoring
  private cacheStats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    dbQueries: 0,
  };

  constructor(
    @InjectRepository(IPAccessRule)
    private accessRuleRepo: Repository<IPAccessRule>,
    @InjectRepository(AccessRuleHistory)
    private historyRepo: Repository<AccessRuleHistory>,
    private dataSource: DataSource, // For transactions
    private configService: ConfigService,
    private auditService: AuditService,
    private cacheService: CacheService,
    private eventEmitter: EventEmitter2,
  ) {
    this.isEnabled =
      this.configService.get<boolean>('ACCESS_CONTROL_ENABLED') || true;
    this.defaultPolicy =
      this.configService.get<'allow' | 'deny'>(
        'ACCESS_CONTROL_DEFAULT_POLICY',
      ) || 'deny';
    this.emergencyAccessEnabled =
      this.configService.get<boolean>('EMERGENCY_ACCESS_ENABLED') || true;

    // Initialize L1 Cache with larger size for multi-tenant
    this.l1Cache = new LRUCache<string, IPAccessRule[]>({
      max: CACHE_CONFIG.L1_MAX_SIZE,
      ttl: CACHE_CONFIG.L1_TTL_MS,
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(
      'AccessControlService initializing with multi-tenant L1/L2 caching...',
    );

    // Pre-warm global rules cache on startup
    try {
      await this.getGlobalRules();
      this.logger.log(
        'Global access control rules cache pre-warmed successfully',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to pre-warm cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Schedule cleanup of expired rules
    this.scheduleCleanup();
  }

  onModuleDestroy(): void {
    this.l1Cache.clear();
    this.logger.log('AccessControlService L1 cache cleared');
  }

  // ==========================================================================
  // MULTI-TENANT CACHING LOGIC
  // ==========================================================================

  /**
   * Get GLOBAL rules (organizationId = null)
   * These apply to ALL organizations.
   */
  private async getGlobalRules(): Promise<IPAccessRule[]> {
    const cacheKey = CACHE_CONFIG.KEYS.GLOBAL_RULES;

    // L1
    const l1Result = this.l1Cache.get(cacheKey);
    if (l1Result !== undefined) {
      this.cacheStats.l1Hits++;
      return l1Result;
    }
    this.cacheStats.l1Misses++;

    // L2
    try {
      const l2Result = await this.cacheService.get<IPAccessRule[]>(cacheKey, {
        namespace: CACHE_CONFIG.NAMESPACE,
      });

      if (l2Result !== null) {
        this.cacheStats.l2Hits++;
        this.l1Cache.set(cacheKey, l2Result);
        return l2Result;
      }
    } catch (error) {
      this.logger.warn(
        `L2 cache read failed for global rules: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
    this.cacheStats.l2Misses++;

    // L3: Query DB for global rules only
    this.cacheStats.dbQueries++;
    const now = new Date();

    const rules = await this.accessRuleRepo.find({
      where: {
        organizationId: IsNull(), // Global rules have null organizationId
        status: AccessRuleStatus.ACTIVE,
        isActive: true,
      },
      order: { priority: 'DESC' },
    });

    // Filter by validity dates
    const activeRules = this.filterByValidity(rules, now);

    // Populate caches
    await this.populateCaches(cacheKey, activeRules, ['global-rules']);
    return activeRules;
  }

  /**
   * Get ORGANIZATION-SPECIFIC rules (organizationId = UUID)
   * These apply ONLY to the specified organization.
   */
  private async getOrgRules(organizationId: string): Promise<IPAccessRule[]> {
    const cacheKey = `${CACHE_CONFIG.KEYS.ORG_RULES_PREFIX}${organizationId}`;

    // L1
    const l1Result = this.l1Cache.get(cacheKey);
    if (l1Result !== undefined) {
      this.cacheStats.l1Hits++;
      return l1Result;
    }
    this.cacheStats.l1Misses++;

    // L2
    try {
      const l2Result = await this.cacheService.get<IPAccessRule[]>(cacheKey, {
        namespace: CACHE_CONFIG.NAMESPACE,
      });

      if (l2Result !== null) {
        this.cacheStats.l2Hits++;
        this.l1Cache.set(cacheKey, l2Result);
        return l2Result;
      }
    } catch (error) {
      this.logger.warn(
        `L2 cache read failed for org ${organizationId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
    this.cacheStats.l2Misses++;

    // L3: Query DB for org-specific rules only
    this.cacheStats.dbQueries++;
    const now = new Date();

    const rules = await this.accessRuleRepo.find({
      where: {
        organizationId: organizationId,
        status: AccessRuleStatus.ACTIVE,
        isActive: true,
      },
      order: { priority: 'DESC' },
    });

    // Filter by validity dates
    const activeRules = this.filterByValidity(rules, now);

    // Populate caches with org-specific tag
    await this.populateCaches(cacheKey, activeRules, [`org-${organizationId}`]);
    return activeRules;
  }

  /**
   * Get ACTIVE RULES for a specific organization context.
   *
   * MULTI-TENANT QUERY LOGIC:
   * - If organizationId is undefined/null: Return ONLY global rules (anonymous/public pages)
   * - If organizationId is provided: Return global rules + org-specific rules (merged)
   *
   * @param organizationId Optional organization ID for context
   * @returns Merged list of applicable rules, sorted by priority
   */
  async getActiveRules(organizationId?: string): Promise<IPAccessRule[]> {
    // Case 1: No organization context -> return global rules only
    if (!organizationId) {
      this.logger.debug(
        'No organization context - returning global rules only',
      );
      return this.getGlobalRules();
    }

    // Case 2: Organization context -> merge global + org rules
    const mergedCacheKey = `${CACHE_CONFIG.KEYS.MERGED_RULES_PREFIX}${organizationId}`;

    // Check merged cache first (L1)
    const l1Merged = this.l1Cache.get(mergedCacheKey);
    if (l1Merged !== undefined) {
      this.cacheStats.l1Hits++;
      return l1Merged;
    }
    this.cacheStats.l1Misses++;

    // Check merged cache (L2)
    try {
      const l2Merged = await this.cacheService.get<IPAccessRule[]>(
        mergedCacheKey,
        {
          namespace: CACHE_CONFIG.NAMESPACE,
        },
      );

      if (l2Merged !== null) {
        this.cacheStats.l2Hits++;
        this.l1Cache.set(mergedCacheKey, l2Merged);
        return l2Merged;
      }
    } catch (error) {
      this.logger.warn(`L2 cache read failed for merged rules: ${error}`);
    }
    this.cacheStats.l2Misses++;

    // Fetch and merge
    const [globalRules, orgRules] = await Promise.all([
      this.getGlobalRules(),
      this.getOrgRules(organizationId),
    ]);

    // Merge and sort by priority (higher priority first)
    const mergedRules = [...globalRules, ...orgRules].sort(
      (a, b) => b.priority - a.priority,
    );

    // Cache merged result
    await this.populateCaches(mergedCacheKey, mergedRules, [
      'global-rules',
      `org-${organizationId}`,
    ]);

    return mergedRules;
  }

  /**
   * Get ALL rules for admin view (with organization scoping)
   *
   * @param organizationId If provided, returns global + org rules. If super admin (null), returns all.
   * @param includeAllOrgs If true (super admin only), returns all rules regardless of org
   */
  async getAllRules(
    organizationId?: string,
    includeAllOrgs = false,
  ): Promise<IPAccessRule[]> {
    // Super Admin: can view all rules
    if (includeAllOrgs) {
      const cacheKey = `${CACHE_CONFIG.KEYS.ALL_RULES_PREFIX}all`;

      // L1
      const l1Result = this.l1Cache.get(cacheKey);
      if (l1Result !== undefined) {
        this.cacheStats.l1Hits++;
        return l1Result;
      }

      // L2
      try {
        const l2Result = await this.cacheService.get<IPAccessRule[]>(cacheKey, {
          namespace: CACHE_CONFIG.NAMESPACE,
        });
        if (l2Result !== null) {
          this.cacheStats.l2Hits++;
          this.l1Cache.set(cacheKey, l2Result);
          return l2Result;
        }
      } catch {
        // Ignore L2 errors
      }

      // L3
      this.cacheStats.dbQueries++;
      const rules = await this.accessRuleRepo.find({
        order: { priority: 'DESC', createdAt: 'DESC' },
      });

      await this.populateCaches(cacheKey, rules, ['all-rules']);
      return rules;
    }

    // Tenant Admin: can only view global + own org rules
    if (organizationId) {
      const cacheKey = `${CACHE_CONFIG.KEYS.ALL_RULES_PREFIX}${organizationId}`;

      const l1Result = this.l1Cache.get(cacheKey);
      if (l1Result !== undefined) {
        this.cacheStats.l1Hits++;
        return l1Result;
      }

      try {
        const l2Result = await this.cacheService.get<IPAccessRule[]>(cacheKey, {
          namespace: CACHE_CONFIG.NAMESPACE,
        });
        if (l2Result !== null) {
          this.cacheStats.l2Hits++;
          this.l1Cache.set(cacheKey, l2Result);
          return l2Result;
        }
      } catch {
        // Ignore
      }

      this.cacheStats.dbQueries++;
      const rules = await this.accessRuleRepo.find({
        where: [
          { organizationId: IsNull() }, // Global rules
          { organizationId: organizationId }, // Org-specific rules
        ],
        order: { priority: 'DESC', createdAt: 'DESC' },
      });

      await this.populateCaches(cacheKey, rules, [
        'global-rules',
        `org-${organizationId}`,
      ]);
      return rules;
    }

    // No org context: return global only
    return this.getGlobalRules();
  }

  // ==========================================================================
  // CACHE HELPERS
  // ==========================================================================

  private filterByValidity(rules: IPAccessRule[], now: Date): IPAccessRule[] {
    return rules.filter((rule) => {
      if (rule.validFrom && rule.validFrom > now) return false;
      if (rule.validUntil && rule.validUntil < now) return false;
      return true;
    });
  }

  private async populateCaches(
    key: string,
    data: IPAccessRule[],
    tags: string[],
  ): Promise<void> {
    // L1
    this.l1Cache.set(key, data);

    // L2
    try {
      await this.cacheService.set(key, data, {
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

  // ==========================================================================
  // TARGETED CACHE INVALIDATION (Multi-Tenant Aware)
  // ==========================================================================

  /**
   * Invalidate caches based on rule change event.
   *
   * Strategy:
   * - Global rule changed (organizationId = null): Invalidate global cache + all merged caches
   * - Org rule changed (organizationId = UUID): Invalidate only that org's caches
   */
  private async invalidateCaches(event: RulesChangedEvent): Promise<void> {
    const startTime = Date.now();

    if (event.organizationId === null || event.organizationId === undefined) {
      // Global rule changed - invalidate everything
      this.logger.log('Global rule changed - invalidating all caches');
      this.l1Cache.clear();

      try {
        await Promise.all([
          this.cacheService.del(CACHE_CONFIG.KEYS.GLOBAL_RULES, {
            namespace: CACHE_CONFIG.NAMESPACE,
          }),
          this.cacheService.del(CACHE_CONFIG.KEYS.EMERGENCY_RULES, {
            namespace: CACHE_CONFIG.NAMESPACE,
          }),
          this.cacheService.invalidateByTags([
            'global-rules',
            'access-control-rules',
          ]),
        ]);
      } catch (error) {
        this.logger.warn(`L2 invalidation failed: ${error}`);
      }
    } else {
      // Org-specific rule changed - invalidate only that org
      const orgId = event.organizationId;
      this.logger.log(
        `Org ${orgId} rule changed - invalidating org-specific caches`,
      );

      // Clear L1 entries for this org
      const keysToDelete = [
        `${CACHE_CONFIG.KEYS.ORG_RULES_PREFIX}${orgId}`,
        `${CACHE_CONFIG.KEYS.MERGED_RULES_PREFIX}${orgId}`,
        `${CACHE_CONFIG.KEYS.ALL_RULES_PREFIX}${orgId}`,
      ];

      for (const key of keysToDelete) {
        this.l1Cache.delete(key);
      }

      // Clear L2
      try {
        await this.cacheService.invalidateByTags([`org-${orgId}`]);
      } catch (error) {
        this.logger.warn(`L2 org invalidation failed: ${error}`);
      }
    }

    this.logger.log(`Cache invalidated in ${Date.now() - startTime}ms`);
  }

  /**
   * Event listener for cache invalidation
   */
  @OnEvent(ACCESS_CONTROL_EVENTS.RULES_CHANGED)
  async handleRulesChanged(payload: RulesChangedEvent): Promise<void> {
    this.logger.log(
      `Received ${ACCESS_CONTROL_EVENTS.RULES_CHANGED} event: ${payload.action} (ruleId: ${payload.ruleId || 'N/A'}, orgId: ${payload.organizationId ?? 'global'})`,
    );
    await this.invalidateCaches(payload);
  }

  // ==========================================================================
  // WRITE OPERATIONS (Transactional with History Tracking)
  // ==========================================================================

  /**
   * Create a new access rule with transactional history tracking
   *
   * @param ruleData Rule data including optional organizationId
   * @param creatorOrganizationId The organization of the creator (for tenant admin enforcement)
   * @param isSuperAdmin Whether the creator is a super admin
   * @param historyContext Audit context (actor info, reason, etc.)
   */
  async createRule(
    ruleData: Partial<IPAccessRule>,
    creatorOrganizationId?: string,
    isSuperAdmin = false,
    historyContext?: HistoryContext,
  ): Promise<IPAccessRule> {
    // SECURITY: Enforce organization scoping
    if (!isSuperAdmin) {
      if (!creatorOrganizationId) {
        throw new Error('Organization context required for non-super-admin');
      }
      ruleData.organizationId = creatorOrganizationId;
    }

    // Use transaction to ensure atomic operation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create and save rule
      const rule = queryRunner.manager.create(IPAccessRule, ruleData);
      const savedRule = await queryRunner.manager.save(rule);

      // Create history record
      const historyRecord = queryRunner.manager.create(AccessRuleHistory, {
        action: HistoryAction.CREATE,
        ruleId: savedRule.id,
        organizationId: savedRule.organizationId,
        actorId: historyContext?.actorId || ruleData.createdBy || null,
        previousState: null, // Rule didn't exist before
        newState: this.ruleToSnapshot(savedRule),
        changedFields: null,
        reason: historyContext?.reason || null,
        actorIpAddress: historyContext?.actorIpAddress || null,
        actorUserAgent: historyContext?.actorUserAgent || null,
      });
      await queryRunner.manager.save(historyRecord);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Emit event for cache invalidation (after commit)
      this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
        ruleId: savedRule.id,
        organizationId: savedRule.organizationId,
        action: 'created',
      } as RulesChangedEvent);

      // Audit log (fire-and-forget)
      this.auditService
        .log({
          eventType: AuditEventType.ACCESS_RULE_CREATED,
          severity: AuditSeverity.MEDIUM,
          description: `IP access rule created${savedRule.organizationId ? ` for org ${savedRule.organizationId}` : ' (global)'}`,
          userId: historyContext?.actorId || ruleData.createdBy || undefined,
          resourceType: 'access_rule',
          resourceId: savedRule.id,
          details: {
            ruleType: ruleData.ruleType,
            ipAddress: ruleData.ipAddress,
            name: ruleData.name,
            organizationId: savedRule.organizationId,
            isGlobal: savedRule.organizationId === null,
          },
        })
        .catch((err) => this.logger.warn(`Audit log failed: ${err}`));

      this.logger.log(
        `Access rule created: ${savedRule.name} (${savedRule.id}) ${savedRule.organizationId ? `for org ${savedRule.organizationId}` : '(global)'}`,
      );
      return savedRule;
    } catch (error) {
      // Rollback on failure
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create rule with history', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update an existing access rule with transactional history tracking
   */
  async updateRule(
    ruleId: string,
    updates: Partial<IPAccessRule>,
    updaterOrganizationId?: string,
    isSuperAdmin = false,
    historyContext?: HistoryContext,
  ): Promise<IPAccessRule> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Fetch current rule (this is previousState)
      const rule = await queryRunner.manager.findOne(IPAccessRule, {
        where: { id: ruleId },
      });
      if (!rule) {
        throw new Error('Rule not found');
      }

      // SECURITY: Tenant admin can only update own org rules
      if (!isSuperAdmin) {
        if (rule.organizationId === null) {
          throw new Error(
            'Cannot update global rules without super admin privileges',
          );
        }
        if (rule.organizationId !== updaterOrganizationId) {
          throw new Error('Cannot update rules from another organization');
        }
        delete updates.organizationId;
      }

      // Capture previous state BEFORE update
      const previousState = this.ruleToSnapshot(rule);

      // Determine changed fields
      const changedFields = Object.keys(updates).filter(
        (key) =>
          (rule as unknown as Record<string, unknown>)[key] !==
          (updates as unknown as Record<string, unknown>)[key],
      );

      // Perform update
      const updatedRule = await queryRunner.manager.save(IPAccessRule, {
        ...rule,
        ...updates,
      });

      // Create history record
      const historyRecord = queryRunner.manager.create(AccessRuleHistory, {
        action: HistoryAction.UPDATE,
        ruleId: ruleId,
        organizationId: updatedRule.organizationId,
        actorId: historyContext?.actorId || updates.createdBy || null,
        previousState: previousState,
        newState: this.ruleToSnapshot(updatedRule),
        changedFields: changedFields.length > 0 ? changedFields : null,
        reason: historyContext?.reason || null,
        actorIpAddress: historyContext?.actorIpAddress || null,
        actorUserAgent: historyContext?.actorUserAgent || null,
      });
      await queryRunner.manager.save(historyRecord);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Emit event
      this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
        ruleId: ruleId,
        organizationId: updatedRule.organizationId,
        action: 'updated',
      } as RulesChangedEvent);

      // Audit log
      this.auditService
        .log({
          eventType: AuditEventType.ACCESS_RULE_UPDATED,
          severity: AuditSeverity.MEDIUM,
          description: 'IP access rule updated',
          userId: historyContext?.actorId || updates.createdBy || undefined,
          resourceType: 'access_rule',
          resourceId: ruleId,
          details: {
            changes: updates,
            changedFields,
            organizationId: updatedRule.organizationId,
          },
        })
        .catch((err) => this.logger.warn(`Audit log failed: ${err}`));

      this.logger.log(`Access rule updated: ${updatedRule.name} (${ruleId})`);
      return updatedRule;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to update rule with history', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Delete an access rule with transactional history tracking
   */
  async deleteRule(
    ruleId: string,
    deletedBy?: string,
    deleterOrganizationId?: string,
    isSuperAdmin = false,
    historyContext?: HistoryContext,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Fetch current rule (this is previousState)
      const rule = await queryRunner.manager.findOne(IPAccessRule, {
        where: { id: ruleId },
      });
      if (!rule) {
        throw new Error('Rule not found');
      }

      // SECURITY: Tenant admin can only delete own org rules
      if (!isSuperAdmin) {
        if (rule.organizationId === null) {
          throw new Error(
            'Cannot delete global rules without super admin privileges',
          );
        }
        if (rule.organizationId !== deleterOrganizationId) {
          throw new Error('Cannot delete rules from another organization');
        }
      }

      const orgId = rule.organizationId;
      const previousState = this.ruleToSnapshot(rule);

      // Create history record BEFORE delete (so we have the ruleId reference)
      const historyRecord = queryRunner.manager.create(AccessRuleHistory, {
        action: HistoryAction.DELETE,
        ruleId: ruleId,
        organizationId: orgId,
        actorId: historyContext?.actorId || deletedBy || null,
        previousState: previousState,
        newState: null, // Rule no longer exists
        changedFields: null,
        reason: historyContext?.reason || null,
        actorIpAddress: historyContext?.actorIpAddress || null,
        actorUserAgent: historyContext?.actorUserAgent || null,
      });
      await queryRunner.manager.save(historyRecord);

      // Delete the rule
      await queryRunner.manager.delete(IPAccessRule, ruleId);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Emit event
      this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
        ruleId: ruleId,
        organizationId: orgId,
        action: 'deleted',
      } as RulesChangedEvent);

      // Audit log
      this.auditService
        .log({
          eventType: AuditEventType.ACCESS_RULE_DELETED,
          severity: AuditSeverity.MEDIUM,
          description: 'IP access rule deleted',
          userId: historyContext?.actorId || deletedBy,
          resourceType: 'access_rule',
          resourceId: ruleId,
          details: {
            ruleName: rule.name,
            ruleType: rule.ruleType,
            organizationId: orgId,
          },
        })
        .catch((err) => this.logger.warn(`Audit log failed: ${err}`));

      this.logger.log(`Access rule deleted: ${rule.name} (${ruleId})`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to delete rule with history', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Convert rule entity to JSON snapshot for history storage
   */
  private ruleToSnapshot(rule: IPAccessRule): Record<string, unknown> {
    // Clone and remove non-serializable properties
    const snapshot: Record<string, unknown> = {};
    const excludeKeys = ['user', 'creator']; // Exclude relation objects

    for (const [key, value] of Object.entries(rule)) {
      if (!excludeKeys.includes(key)) {
        snapshot[key] = value;
      }
    }

    return snapshot;
  }

  /**
   * Get history for a specific rule (for audit viewing)
   */
  async getRuleHistory(
    ruleId: string,
    organizationId?: string,
    isSuperAdmin = false,
  ): Promise<AccessRuleHistory[]> {
    // Security: Validate access to the rule's org
    const firstHistoryRecord = await this.historyRepo.findOne({
      where: { ruleId },
      order: { createdAt: 'ASC' },
    });

    if (!firstHistoryRecord) {
      return [];
    }

    if (!isSuperAdmin && firstHistoryRecord.organizationId !== organizationId) {
      throw new Error('Cannot access history from another organization');
    }

    return this.historyRepo.find({
      where: { ruleId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all history for an organization (for compliance reporting)
   */
  async getOrganizationHistory(
    organizationId?: string,
    isSuperAdmin = false,
    options?: { limit?: number; offset?: number },
  ): Promise<AccessRuleHistory[]> {
    const whereClause = isSuperAdmin
      ? {} // Super admin can see all
      : organizationId
        ? [{ organizationId }, { organizationId: IsNull() }] // Org admin sees their org + global
        : { organizationId: IsNull() }; // No org = global only

    return this.historyRepo.find({
      where: whereClause,
      order: { createdAt: 'DESC' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });
  }

  // ==========================================================================
  // ACCESS CHECKING (Multi-Tenant Aware)
  // ==========================================================================

  /**
   * Check if access is allowed for the given IP and user
   *
   * @param ipAddress Client IP address
   * @param userId User ID (optional)
   * @param userAgent User agent string (optional)
   * @param projectId Project ID (optional)
   * @param userRoles User roles (optional)
   * @param organizationId Organization context for multi-tenant scoping
   */
  async checkAccess(
    ipAddress: string,
    userId?: string,
    userAgent?: string,
    projectId?: string,
    userRoles?: string[],
    organizationId?: string,
  ): Promise<AccessCheckResult> {
    if (!this.isEnabled) {
      return { allowed: true, reason: 'Access control disabled' };
    }

    try {
      const location = this.getIPLocation(ipAddress);

      // Check emergency access first
      if (this.emergencyAccessEnabled) {
        const emergencyResult = await this.checkEmergencyAccess(
          ipAddress,
          organizationId,
        );
        if (emergencyResult.allowed) {
          return emergencyResult;
        }
      }

      // Get active rules for this organization context
      const rules = await this.getActiveRules(organizationId);

      // Check rules in priority order
      for (const rule of rules) {
        const match = this.checkRuleMatch(
          rule,
          ipAddress,
          userId,
          projectId,
          userRoles,
          location || undefined,
        );
        if (match) {
          // Update rule hit count
          this.updateRuleHitCount(rule.id).catch(() => {});

          const allowed =
            rule.ruleType === AccessRuleType.WHITELIST ||
            rule.ruleType === AccessRuleType.GEOGRAPHIC;

          // Log access attempt
          await this.logAccessAttempt({
            ipAddress,
            userId,
            userAgent,
            timestamp: new Date(),
            allowed,
            reason: `Matched rule: ${rule.name}`,
            ruleId: rule.id,
            location: location || undefined,
            organizationId,
          });

          return {
            allowed,
            reason: `Matched rule: ${rule.name}`,
            ruleId: rule.id,
            ruleName: rule.name,
            requiresApproval: rule.requiresApproval,
            expiresAt: rule.expiresAt || undefined,
            metadata: rule.metadata || undefined,
          };
        }
      }

      // No rules matched, apply default policy
      const allowed = this.defaultPolicy === 'allow';
      const reason = allowed
        ? 'No rules matched, default allow'
        : 'No rules matched, default deny';

      await this.logAccessAttempt({
        ipAddress,
        userId,
        userAgent,
        timestamp: new Date(),
        allowed,
        reason,
        location: location || undefined,
        organizationId,
      });

      return { allowed, reason };
    } catch (error) {
      this.logger.error('Access control check failed', error);
      const allowed = this.defaultPolicy === 'allow';
      return {
        allowed,
        reason: `Access control error, default ${this.defaultPolicy}`,
      };
    }
  }

  // ==========================================================================
  // CACHE MONITORING
  // ==========================================================================

  getCacheStats(): {
    l1: { size: number; maxSize: number };
    stats: CacheStats;
    hitRates: { l1: string; l2: string };
  } {
    const l1Total = this.cacheStats.l1Hits + this.cacheStats.l1Misses;
    const l2Total = this.cacheStats.l2Hits + this.cacheStats.l2Misses;

    return {
      l1: {
        size: this.l1Cache.size,
        maxSize: CACHE_CONFIG.L1_MAX_SIZE,
      },
      stats: { ...this.cacheStats },
      hitRates: {
        l1:
          l1Total > 0
            ? `${((this.cacheStats.l1Hits / l1Total) * 100).toFixed(1)}%`
            : '0%',
        l2:
          l2Total > 0
            ? `${((this.cacheStats.l2Hits / l2Total) * 100).toFixed(1)}%`
            : '0%',
      },
    };
  }

  async getAccessStats(
    organizationId?: string,
    isSuperAdmin = false,
  ): Promise<{
    totalRules: number;
    activeRules: number;
    whitelistRules: number;
    blacklistRules: number;
    geographicRules: number;
    timeBasedRules: number;
    globalRules: number;
    orgRules: number;
    totalHits: number;
    topRules: Array<{ ruleId: string; name: string; hitCount: number }>;
    cache: ReturnType<typeof this.getCacheStats>;
  }> {
    const rules = await this.getAllRules(organizationId, isSuperAdmin);
    const activeRules = rules.filter(
      (r) => r.status === AccessRuleStatus.ACTIVE && r.isActive,
    );

    return {
      totalRules: rules.length,
      activeRules: activeRules.length,
      whitelistRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.WHITELIST,
      ).length,
      blacklistRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.BLACKLIST,
      ).length,
      geographicRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.GEOGRAPHIC,
      ).length,
      timeBasedRules: rules.filter(
        (r) => r.ruleType === AccessRuleType.TIME_BASED,
      ).length,
      globalRules: rules.filter((r) => r.organizationId === null).length,
      orgRules: rules.filter((r) => r.organizationId !== null).length,
      totalHits: rules.reduce((sum, r) => sum + r.hitCount, 0),
      topRules: rules
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 10)
        .map((r) => ({ ruleId: r.id, name: r.name, hitCount: r.hitCount })),
      cache: this.getCacheStats(),
    };
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private checkRuleMatch(
    rule: IPAccessRule,
    ipAddress: string,
    userId?: string,
    projectId?: string,
    userRoles?: string[],
    location?: IPLocation,
  ): boolean {
    if (
      rule.ruleType === AccessRuleType.USER_SPECIFIC &&
      rule.userId !== userId
    ) {
      return false;
    }

    if (rule.ruleType === AccessRuleType.ROLE_BASED && userRoles) {
      const hasMatchingRole = rule.allowedRoles?.some((role) =>
        userRoles.includes(role),
      );
      if (!hasMatchingRole) return false;
    }

    if (rule.allowedProjects && projectId) {
      if (!rule.allowedProjects.includes(projectId)) return false;
    }

    if (
      rule.ruleType === AccessRuleType.WHITELIST ||
      rule.ruleType === AccessRuleType.BLACKLIST
    ) {
      if (
        !this.isIPMatch(
          ipAddress,
          rule.ipAddress,
          rule.ipType,
          rule.endIpAddress || undefined,
        )
      ) {
        return false;
      }
    }

    if (rule.ruleType === AccessRuleType.GEOGRAPHIC && location) {
      if (rule.country && rule.country !== location.country) return false;
      if (rule.region && rule.region !== location.region) return false;
      if (rule.city && rule.city !== location.city) return false;
    }

    if (rule.ruleType === AccessRuleType.TIME_BASED) {
      if (!this.isTimeAllowed(rule)) return false;
    }

    return true;
  }

  private isIPMatch(
    ipAddress: string,
    ruleIP: string,
    ipType: IPType,
    endIP?: string,
  ): boolean {
    switch (ipType) {
      case IPType.SINGLE:
        return ipAddress === ruleIP;
      case IPType.RANGE:
        if (!endIP) return false;
        return this.isIPInRange(ipAddress, ruleIP, endIP);
      case IPType.CIDR:
        return this.isIPInCIDR(ipAddress, ruleIP);
      case IPType.WILDCARD:
        return this.isIPWildcardMatch(ipAddress, ruleIP);
      default:
        return false;
    }
  }

  private isIPInRange(
    ipAddress: string,
    startIP: string,
    endIP: string,
  ): boolean {
    const ip = this.ipToNumber(ipAddress);
    const start = this.ipToNumber(startIP);
    const end = this.ipToNumber(endIP);
    return ip >= start && ip <= end;
  }

  private isIPInCIDR(ipAddress: string, cidr: string): boolean {
    const [network, prefixLength] = cidr.split('/');
    const ip = this.ipToNumber(ipAddress);
    const networkIP = this.ipToNumber(network);
    const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
    return (ip & mask) === (networkIP & mask);
  }

  private isIPWildcardMatch(ipAddress: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(ipAddress);
  }

  private isTimeAllowed(rule: IPAccessRule): boolean {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const currentDay = now.getDay();

    if (rule.allowedStartTime && rule.allowedEndTime) {
      if (
        currentTime < rule.allowedStartTime ||
        currentTime > rule.allowedEndTime
      ) {
        return false;
      }
    }

    if (rule.allowedDays && !rule.allowedDays.includes(currentDay)) {
      return false;
    }

    return true;
  }

  private async checkEmergencyAccess(
    ipAddress: string,
    organizationId?: string,
  ): Promise<AccessCheckResult> {
    const cacheKey = organizationId
      ? `${CACHE_CONFIG.KEYS.EMERGENCY_RULES}:${organizationId}`
      : CACHE_CONFIG.KEYS.EMERGENCY_RULES;

    let emergencyRules: IPAccessRule[] | undefined = this.l1Cache.get(cacheKey);

    if (emergencyRules === undefined) {
      try {
        const l2Result = await this.cacheService.get<IPAccessRule[]>(cacheKey, {
          namespace: CACHE_CONFIG.NAMESPACE,
        });
        if (l2Result !== null) {
          emergencyRules = l2Result;
          this.l1Cache.set(cacheKey, l2Result);
        }
      } catch {
        // Ignore
      }

      if (emergencyRules === undefined) {
        const whereClause = organizationId
          ? [
              {
                ruleType: AccessRuleType.WHITELIST,
                isEmergency: true,
                status: AccessRuleStatus.ACTIVE,
                isActive: true,
                organizationId: IsNull(),
              },
              {
                ruleType: AccessRuleType.WHITELIST,
                isEmergency: true,
                status: AccessRuleStatus.ACTIVE,
                isActive: true,
                organizationId: organizationId,
              },
            ]
          : {
              ruleType: AccessRuleType.WHITELIST,
              isEmergency: true,
              status: AccessRuleStatus.ACTIVE,
              isActive: true,
              organizationId: IsNull(),
            };

        emergencyRules = await this.accessRuleRepo.find({ where: whereClause });

        try {
          await this.cacheService.set(cacheKey, emergencyRules, {
            namespace: CACHE_CONFIG.NAMESPACE,
            ttl: CACHE_CONFIG.L2_TTL_SECONDS,
            tags: ['access-control-rules', 'emergency-rules'],
          });
        } catch {
          // Ignore
        }
        this.l1Cache.set(cacheKey, emergencyRules);
      }
    }

    for (const rule of emergencyRules) {
      if (
        this.isIPMatch(
          ipAddress,
          rule.ipAddress,
          rule.ipType,
          rule.endIpAddress || undefined,
        )
      ) {
        return {
          allowed: true,
          reason: `Emergency access granted: ${rule.emergencyReason}`,
          ruleId: rule.id,
          ruleName: rule.name,
          metadata: { emergency: true, reason: rule.emergencyReason },
        };
      }
    }

    return { allowed: false, reason: 'No emergency access' };
  }

  private getIPLocation(ipAddress: string): IPLocation | null {
    try {
      const geo = geoip.lookup(ipAddress);
      if (!geo) return null;
      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone: geo.timezone,
        latitude: geo.ll[0],
        longitude: geo.ll[1],
      };
    } catch (error) {
      this.logger.warn(`Failed to get location for IP ${ipAddress}`, error);
      return null;
    }
  }

  private ipToNumber(ip: string): number {
    return (
      ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>>
      0
    );
  }

  private async updateRuleHitCount(ruleId: string): Promise<void> {
    await this.accessRuleRepo.increment({ id: ruleId }, 'hitCount', 1);
    await this.accessRuleRepo.update(ruleId, { lastHitAt: new Date() });
  }

  private async logAccessAttempt(attempt: AccessAttempt): Promise<void> {
    try {
      await this.auditService.log({
        eventType: attempt.allowed
          ? AuditEventType.ACCESS_GRANTED
          : AuditEventType.ACCESS_DENIED,
        severity: attempt.allowed ? AuditSeverity.LOW : AuditSeverity.MEDIUM,
        description: attempt.allowed ? 'Access granted' : 'Access denied',
        userId: attempt.userId,
        resourceType: 'access_control',
        resourceId: attempt.ruleId,
        ipAddress: attempt.ipAddress,
        userAgent: attempt.userAgent,
        details: {
          reason: attempt.reason,
          location: attempt.location,
          timestamp: attempt.timestamp,
          organizationId: attempt.organizationId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log access attempt', error);
    }
  }

  private scheduleCleanup(): void {
    cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredRules();
    });
  }

  private async cleanupExpiredRules(): Promise<void> {
    const now = new Date();
    const expiredRules = await this.accessRuleRepo.find({
      where: {
        status: AccessRuleStatus.ACTIVE,
        expiresAt: LessThan(now),
      },
    });

    for (const rule of expiredRules) {
      await this.accessRuleRepo.update(rule.id, {
        status: AccessRuleStatus.EXPIRED,
        isActive: false,
      });

      // Emit event for each affected org
      this.eventEmitter.emit(ACCESS_CONTROL_EVENTS.RULES_CHANGED, {
        ruleId: rule.id,
        organizationId: rule.organizationId,
        action: 'expired-cleanup',
      } as RulesChangedEvent);
    }

    if (expiredRules.length > 0) {
      this.logger.log(`Cleaned up ${expiredRules.length} expired access rules`);
    }
  }
}
