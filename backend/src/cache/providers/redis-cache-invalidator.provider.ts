import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';
import { ICacheInvalidator } from '../interfaces/cache.interfaces';
import { buildTagKey } from '../utils/cache-key.util';

/**
 * RedisCacheInvalidator — bulk invalidation provider implementing
 * `ICacheInvalidator`.
 *
 * NAMESPACE FLUSH (`flushNamespace`) uses cursor-based SCAN with batched
 * UNLINK pipelines (non-blocking DEL). Avoids the O(N) main-thread stall
 * caused by KEYS at scale.
 *
 * TAG INVALIDATION reads the `tag:{tagName}` Redis sets written by
 * `RedisCacheStore.set` and pipelines deletion of all member keys plus the
 * tag set itself.
 */
@Injectable()
export class RedisCacheInvalidator implements ICacheInvalidator {
  private readonly logger = new Logger(RedisCacheInvalidator.name);

  constructor(@Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis) {}

  private isReady(): boolean {
    return this.client.status === 'ready';
  }

  async flushNamespace(namespace: string): Promise<boolean> {
    if (!this.isReady()) return false;

    const pattern = `${namespace}:*`;
    let deletedCount = 0;

    return new Promise<boolean>((resolve, reject) => {
      const stream = this.client.scanStream({ match: pattern, count: 100 });

      stream.on('data', (keys: string[]) => {
        if (!keys.length) return;
        void (async () => {
          stream.pause();
          try {
            const pipeline = this.client.pipeline();
            for (const key of keys) {
              pipeline.unlink(key);
            }
            await pipeline.exec();
            deletedCount += keys.length;
          } catch (error: unknown) {
            this.logger.error(
              `Error deleting batch in namespace ${namespace}: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            );
          }
          stream.resume();
        })();
      });

      stream.on('end', () => {
        this.logger.debug(
          `Flushed namespace ${namespace}: ${deletedCount} keys deleted`,
        );
        resolve(true);
      });

      stream.on('error', (error: Error) => {
        this.logger.error(
          `Error scanning namespace ${namespace}: ${error.message}`,
        );
        reject(error);
      });
    });
  }

  async invalidateByTags(tags: string[]): Promise<boolean> {
    if (!this.isReady() || !tags.length) return false;

    try {
      const pipeline = this.client.pipeline();

      for (const tag of tags) {
        const tagKey = buildTagKey(tag);
        const keys = await this.client.smembers(tagKey);
        if (keys.length > 0) {
          pipeline.del(...keys);
          pipeline.del(tagKey);
        }
      }

      const results = await pipeline.exec();
      return results?.every((result) => result[1] !== null) ?? false;
    } catch (error: unknown) {
      this.logger.error(
        `Error invalidating cache by tags ${tags.join(',')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  async getKeysByTags(tags: string[]): Promise<string[]> {
    if (!this.isReady() || !tags.length) return [];
    try {
      const union = new Set<string>();
      for (const tag of tags) {
        const members = await this.client.smembers(buildTagKey(tag));
        members.forEach((m) => union.add(m));
      }
      return Array.from(union);
    } catch (error: unknown) {
      this.logger.error(
        `Error reading keys by tags ${tags.join(',')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return [];
    }
  }
}
