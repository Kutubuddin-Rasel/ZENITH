import { Inject, Injectable } from '@nestjs/common';
import { CACHE_STORE_TOKEN } from '../../../../cache/constants/cache.tokens';
import { ICacheStore } from '../../../../cache/interfaces/cache.interfaces';
import { ICsrfTokenRepository } from '../../interfaces/csrf.interfaces';

/**
 * Owns the `csrf:<userId>` key schema. Only this class is permitted to
 * construct CSRF cache keys; command/query services depend on this port,
 * never on the cache store directly. This makes the storage substrate
 * swappable (e.g., migration to a tamper-evident JWT envelope) by
 * replacing this single class.
 */
@Injectable()
export class RedisCsrfTokenRepository extends ICsrfTokenRepository {
  constructor(
    @Inject(CACHE_STORE_TOKEN) private readonly cacheStore: ICacheStore,
  ) {
    super();
  }

  async get(userId: string): Promise<string | null> {
    return this.cacheStore.get<string>(this.key(userId));
  }

  async set(userId: string, token: string, ttlSeconds: number): Promise<void> {
    await this.cacheStore.set(this.key(userId), token, { ttl: ttlSeconds });
  }

  async delete(userId: string): Promise<void> {
    await this.cacheStore.del(this.key(userId));
  }

  private key(userId: string): string {
    return `csrf:${userId}`;
  }
}
