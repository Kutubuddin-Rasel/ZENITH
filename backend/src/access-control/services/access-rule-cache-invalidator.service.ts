import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CACHE_INVALIDATOR_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheInvalidator } from '../../cache/interfaces/cache.interfaces';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';
import { CACHE_CONFIG } from '../constants/access-control.cache';
import {
  ACCESS_CONTROL_EVENTS,
  RulesChangedEvent,
} from '../constants/access-control.events';
import { AccessRuleL1Cache } from './access-rule-l1-cache';

/**
 * Event-driven cache invalidation. Listens for RULES_CHANGED and clears the
 * shared L1 + tagged L2 entries. Split from the read path so each side stays
 * under the SRP threshold while sharing one L1 store.
 */
@Injectable()
export class AccessRuleCacheInvalidatorService {
  private readonly logger = new Logger(AccessRuleCacheInvalidatorService.name);

  constructor(
    private readonly l1: AccessRuleL1Cache,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly cacheInvalidator: ICacheInvalidator,
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {}

  @OnEvent(ACCESS_CONTROL_EVENTS.RULES_CHANGED)
  async handleRulesChanged(payload: RulesChangedEvent): Promise<void> {
    this.logger.log(
      `Received ${ACCESS_CONTROL_EVENTS.RULES_CHANGED} event: ${payload.action} (ruleId: ${payload.ruleId || 'N/A'}, orgId: ${payload.organizationId ?? 'global'})`,
    );
    await this.invalidate(payload);
  }

  async invalidate(event: RulesChangedEvent): Promise<void> {
    const startTime = Date.now();

    if (event.organizationId === null || event.organizationId === undefined) {
      this.logger.log('Global rule changed - invalidating all caches');
      this.l1.clear();

      try {
        await Promise.all([
          this.cacheStore.del(CACHE_CONFIG.KEYS.GLOBAL_RULES, {
            namespace: CACHE_CONFIG.NAMESPACE,
          }),
          this.cacheStore.del(CACHE_CONFIG.KEYS.EMERGENCY_RULES, {
            namespace: CACHE_CONFIG.NAMESPACE,
          }),
          this.cacheInvalidator.invalidateByTags([
            'global-rules',
            'access-control-rules',
          ]),
        ]);
      } catch (error) {
        this.logger.warn(`L2 invalidation failed: ${error}`);
      }
    } else {
      const orgId = event.organizationId;
      this.logger.log(
        `Org ${orgId} rule changed - invalidating org-specific caches`,
      );

      for (const key of [
        `${CACHE_CONFIG.KEYS.ORG_RULES_PREFIX}${orgId}`,
        `${CACHE_CONFIG.KEYS.MERGED_RULES_PREFIX}${orgId}`,
        `${CACHE_CONFIG.KEYS.ALL_RULES_PREFIX}${orgId}`,
      ]) {
        this.l1.delete(key);
      }

      try {
        await this.cacheInvalidator.invalidateByTags([`org-${orgId}`]);
      } catch (error) {
        this.logger.warn(`L2 org invalidation failed: ${error}`);
      }
    }

    this.logger.log(`Cache invalidated in ${Date.now() - startTime}ms`);
  }
}
