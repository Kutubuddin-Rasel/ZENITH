import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_INVALIDATOR_TOKEN,
  CACHE_STORE_TOKEN,
} from '../constants/cache.tokens';
import { CachedIssue, CachedProject, CachedUser } from '../cache.interfaces';
import {
  ICacheInvalidator,
  ICacheStore,
  IEntityCache,
} from '../interfaces/cache.interfaces';

/**
 * EntityCacheFacade — domain-typed cache helpers implementing `IEntityCache`.
 *
 * Encapsulates the per-entity namespace + tag conventions so application
 * services don't need to know that "users" is the namespace, that user
 * caches expire after 1h, or that `project:{id}` is the cache-busting tag.
 *
 * Backed by `ICacheStore` for read/write and `ICacheInvalidator` for
 * tag-driven busts — no direct Redis access here.
 */
@Injectable()
export class EntityCacheFacade implements IEntityCache {
  constructor(
    @Inject(CACHE_STORE_TOKEN) private readonly store: ICacheStore,
    @Inject(CACHE_INVALIDATOR_TOKEN)
    private readonly invalidator: ICacheInvalidator,
  ) {}

  async cacheUser(
    userId: string,
    user: CachedUser,
    ttl = 3600,
  ): Promise<boolean> {
    return this.store.set(`user:${userId}`, user, {
      ttl,
      namespace: 'users',
      tags: ['user', `user:${userId}`],
    });
  }

  async getCachedUser(userId: string): Promise<CachedUser | null> {
    return this.store.get<CachedUser>(`user:${userId}`, { namespace: 'users' });
  }

  async cacheProject(
    projectId: string,
    project: CachedProject,
    ttl = 1800,
  ): Promise<boolean> {
    return this.store.set(`project:${projectId}`, project, {
      ttl,
      namespace: 'projects',
      tags: ['project', `project:${projectId}`],
    });
  }

  async getCachedProject(projectId: string): Promise<CachedProject | null> {
    return this.store.get<CachedProject>(`project:${projectId}`, {
      namespace: 'projects',
    });
  }

  async cacheIssues(
    projectId: string,
    issues: CachedIssue[],
    ttl = 900,
  ): Promise<boolean> {
    return this.store.set(`issues:${projectId}`, issues, {
      ttl,
      namespace: 'issues',
      tags: ['issues', `project:${projectId}`],
    });
  }

  async getCachedIssues(projectId: string): Promise<CachedIssue[]> {
    const result = await this.store.get<CachedIssue[]>(`issues:${projectId}`, {
      namespace: 'issues',
    });
    return result ?? [];
  }

  async invalidateProjectCache(projectId: string): Promise<boolean> {
    return this.invalidator.invalidateByTags([`project:${projectId}`]);
  }

  async invalidateUserCache(userId: string): Promise<boolean> {
    return this.invalidator.invalidateByTags([`user:${userId}`]);
  }
}
