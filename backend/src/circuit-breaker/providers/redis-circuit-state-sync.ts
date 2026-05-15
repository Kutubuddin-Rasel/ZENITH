import { Inject, Injectable, Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { CACHE_STORE_TOKEN } from '../../cache/constants/cache.tokens';
import { ICacheStore } from '../../cache/interfaces/cache.interfaces';

/**
 * Persisted circuit state. HALF_OPEN is transient (local-only) and never
 * written to Redis.
 */
type PersistedCircuitState = 'OPEN' | 'CLOSED';

const REDIS_KEY_PREFIX = 'circuit' as const;
const REDIS_STATE_NAMESPACE = 'circuit_breaker_state' as const;

/**
 * Failsafe: state expires after one hour so an app crash can't leave a
 * circuit pinned OPEN forever.
 */
const REDIS_STATE_TTL_SECONDS = 3600;

/**
 * RedisCircuitStateSync
 *
 * Owns the cross-pod state replication concern for the breaker engine.
 * Hydrates a fresh breaker from Redis on creation (if another pod has
 * already tripped it globally) and persists local OPEN/CLOSE transitions
 * back to Redis so peers converge.
 *
 * Depends on the abstract `ICacheStore` contract (`CACHE_STORE_TOKEN`)
 * only — the breaker module never imports a concrete Redis provider.
 *
 * STRICT DI: the cache store is mandatory. Cross-pod state replication
 * is load-bearing for production HA — if `CacheModule` isn't wired, the
 * container must fail to boot rather than silently degrade to local-only
 * mode.
 */
@Injectable()
export class RedisCircuitStateSync {
  private readonly logger = new Logger(RedisCircuitStateSync.name);

  constructor(
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
  ) {}

  /**
   * Persist OPEN state to Redis with TTL on `open` events; clear on
   * `close`. Half-open is local-only.
   */
  attach(breaker: CircuitBreaker, name: string): void {
    const key = this.buildKey(name);

    breaker.on('open', () => {
      void this.persist(key, 'OPEN', name);
    });

    breaker.on('close', () => {
      void this.clear(key, name);
    });
  }

  /**
   * Background sync from Redis. If another pod tripped this breaker
   * globally, force the local instance OPEN immediately. Failed reads
   * degrade silently to local-only operation.
   */
  async hydrate(breaker: CircuitBreaker, name: string): Promise<void> {
    const key = this.buildKey(name);

    try {
      const state = await this.cacheStore.get<PersistedCircuitState>(key, {
        namespace: REDIS_STATE_NAMESPACE,
      });

      if (state === 'OPEN') {
        this.logger.warn(
          `🔴 Hydrating from Redis: Circuit '${name}' is OPEN globally`,
        );
        breaker.open();
      } else {
        this.logger.debug(`Circuit '${name}' is CLOSED in Redis (or not set)`);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to hydrate circuit '${name}' from Redis:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private buildKey(name: string): string {
    return `${REDIS_KEY_PREFIX}:${name}:state`;
  }

  private async persist(
    key: string,
    state: PersistedCircuitState,
    name: string,
  ): Promise<void> {
    try {
      await this.cacheStore.set(key, state, {
        ttl: REDIS_STATE_TTL_SECONDS,
        namespace: REDIS_STATE_NAMESPACE,
      });
      this.logger.debug(`Persisted circuit '${name}' state to Redis: ${state}`);
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to persist circuit '${name}' to Redis:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async clear(key: string, name: string): Promise<void> {
    try {
      await this.cacheStore.del(key, {
        namespace: REDIS_STATE_NAMESPACE,
      });
      this.logger.debug(`Cleared circuit '${name}' state from Redis`);
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to clear circuit '${name}' from Redis:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
}
