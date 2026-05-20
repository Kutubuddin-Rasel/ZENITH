import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CACHE_INVALIDATOR_TOKEN,
  CACHE_STORE_TOKEN,
} from '../../cache/constants/cache.tokens';
import type {
  ICacheInvalidator,
  ICacheStore,
} from '../../cache/interfaces/cache.interfaces';
import type { IPermissionCacheStore } from '../interfaces/rbac.interfaces';

const NAMESPACE = 'rbac:role-perms';
const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes

/**
 * RedisPermissionCacheStore
 *
 * Cross-pod safe replacement for the in-process `Map` cache that the
 * legacy `RBACService` used to memoize resolved role permissions. Backed
 * by the cache module's segregated `ICacheStore` / `ICacheInvalidator`
 * surface so RBAC inherits the global Redis lifecycle without owning a
 * client of its own.
 *
 * Key Layout
 * ----------
 * Every key is namespaced as `rbac:role-perms:{roleId}`. Single-key
 * invalidation goes through `del()`; bulk invalidation
 * (`invalidateAll()`) is a namespace flush via the invalidator — the
 * one operation the old `Map` could not perform safely across pods.
 *
 * Why a `null`-distinguishing sentinel is NOT needed
 * --------------------------------------------------
 * RBAC stores a resolved string-array, never `null`. A miss returns
 * `null` directly from the cache primitive and the policy service
 * recomputes on demand.
 */
@Injectable()
export class RedisPermissionCacheStore implements IPermissionCacheStore {
  private readonly logger = new Logger(RedisPermissionCacheStore.name);

  constructor(
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly invalidator: ICacheInvalidator,
  ) {}

  async get(roleId: string): Promise<readonly string[] | null> {
    const value = await this.cacheStore.get<string[]>(this.keyFor(roleId), {
      namespace: NAMESPACE,
    });
    return value ?? null;
  }

  async set(
    roleId: string,
    permissionKeys: readonly string[],
    ttlSeconds?: number,
  ): Promise<void> {
    await this.cacheStore.set<string[]>(
      this.keyFor(roleId),
      [...permissionKeys],
      {
        namespace: NAMESPACE,
        ttl: ttlSeconds ?? DEFAULT_TTL_SECONDS,
      },
    );
  }

  async invalidate(roleId: string): Promise<void> {
    await this.cacheStore.del(this.keyFor(roleId), {
      namespace: NAMESPACE,
    });
  }

  async invalidateAll(): Promise<void> {
    const flushed = await this.invalidator.flushNamespace(NAMESPACE);
    if (!flushed) {
      this.logger.warn(
        `flushNamespace returned false for "${NAMESPACE}" — permission caches may be stale across pods`,
      );
    }
  }

  private keyFor(roleId: string): string {
    return roleId;
  }
}
