import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';
import {
  ICacheHealth,
  RedisStats,
} from '../interfaces/cache.interfaces';

/**
 * RedisCacheHealth — liveness and stats provider implementing `ICacheHealth`.
 *
 * Used by health endpoints / admin diagnostics. Isolated so application
 * services don't pull Redis introspection capabilities into their type surface.
 */
@Injectable()
export class RedisCacheHealth implements ICacheHealth {
  private readonly logger = new Logger(RedisCacheHealth.name);

  constructor(@Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis) {}

  isHealthy(): boolean {
    return this.client.status === 'ready';
  }

  async ping(): Promise<string> {
    if (!this.isHealthy()) {
      throw new Error('Redis not connected');
    }
    return this.client.ping();
  }

  async getStats(): Promise<RedisStats> {
    if (!this.isHealthy()) {
      return { connected: false, memory: null, info: null, keyspace: null };
    }
    try {
      const [memory, info, keyspace] = await Promise.all([
        this.client.memory('STATS'),
        this.client.info('memory'),
        this.client.info('keyspace'),
      ]);
      return {
        connected: true,
        memory,
        info: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error getting cache stats: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return { connected: false, memory: null, info: null, keyspace: null };
    }
  }

  private parseRedisInfo(info: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const line of info.split('\r\n')) {
      if (!line.includes(':')) continue;
      const [key, value] = line.split(':');
      result[key] = isNaN(Number(value)) ? value : Number(value);
    }
    return result;
  }
}
