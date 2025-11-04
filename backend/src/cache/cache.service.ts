import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { promisify } from 'util';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  namespace?: string; // Namespace for key organization
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private isConnected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        db: this.configService.get('REDIS_DB', 0),
        keyPrefix: this.configService.get('REDIS_KEY_PREFIX', 'zenith:'),
        enableReadyCheck: false,
        maxRetriesPerRequest: 1, // Reduced retries
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 5000, // Reduced timeout
        commandTimeout: 3000, // Reduced timeout
        enableOfflineQueue: false,
        family: 4,
        enableAutoPipelining: true,
      });

      this.redis.on('error', (err) => {
        this.logger.warn(
          'Redis connection error (cache will be disabled):',
          err.message,
        );
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        this.logger.log('Redis ready for operations');
        this.isConnected = true;
      });

      this.redis.on('reconnecting', () => {
        this.logger.log('Redis reconnecting...');
      });

      this.redis.on('end', () => {
        this.logger.log('Redis connection ended');
        this.isConnected = false;
      });

      // Test connection with timeout
      const pingPromise = this.redis.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timeout')), 3000),
      );

      try {
        await Promise.race([pingPromise, timeoutPromise]);
        this.logger.log('Cache service initialized successfully');
      } catch (error) {
        this.logger.warn(
          'Redis not available, cache will be disabled:',
          error.message,
        );
        this.isConnected = false;
      }
    } catch (error) {
      this.logger.warn(
        'Failed to initialize cache service (cache will be disabled):',
        error.message,
      );
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Cache service disconnected');
    }
  }

  private buildKey(key: string, options?: CacheOptions): string {
    const namespace = options?.namespace || 'default';
    return `${namespace}:${key}`;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn('Cache not connected, returning null');
      return null;
    }

    try {
      const fullKey = this.buildKey(key, options);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      this.logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Cache not connected, skipping set operation');
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options);
      const serializedValue = JSON.stringify(value);

      let result: 'OK' | null;

      if (options?.ttl) {
        result = await this.redis.setex(fullKey, options.ttl, serializedValue);
      } else {
        result = await this.redis.set(fullKey, serializedValue);
      }

      // Add tags for cache invalidation
      if (options?.tags && options.tags.length > 0) {
        await this.addTagsToKey(fullKey, options.tags);
      }

      return result === 'OK';
    } catch (error) {
      this.logger.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  }

  async del(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Cache not connected, skipping delete operation');
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options);
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      this.logger.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking cache key existence ${key}:`, error);
      return false;
    }
  }

  async expire(
    key: string,
    ttl: number,
    options?: CacheOptions,
  ): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Error setting expiration for cache key ${key}:`,
        error,
      );
      return false;
    }
  }

  async ttl(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected) {
      return -1;
    }

    try {
      const fullKey = this.buildKey(key, options);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      this.logger.error(`Error getting TTL for cache key ${key}:`, error);
      return -1;
    }
  }

  async flushNamespace(namespace: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const pattern = `${namespace}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return true;
      }

      const result = await this.redis.del(...keys);
      return result > 0;
    } catch (error) {
      this.logger.error(`Error flushing namespace ${namespace}:`, error);
      return false;
    }
  }

  async invalidateByTags(tags: string[]): Promise<boolean> {
    if (!this.isConnected || !tags.length) {
      return false;
    }

    try {
      const pipeline = this.redis.pipeline();

      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.redis.smembers(tagKey);

        if (keys.length > 0) {
          pipeline.del(...keys);
          pipeline.del(tagKey);
        }
      }

      const results = await pipeline.exec();
      return results?.every((result) => result[1] !== null) || false;
    } catch (error) {
      this.logger.error(`Error invalidating cache by tags ${tags}:`, error);
      return false;
    }
  }

  private async addTagsToKey(key: string, tags: string[]): Promise<void> {
    if (!this.isConnected || !tags.length) {
      return;
    }

    try {
      const pipeline = this.redis.pipeline();

      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        pipeline.sadd(tagKey, key);
        pipeline.expire(tagKey, 86400); // 24 hours
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.error(`Error adding tags to key ${key}:`, error);
    }
  }

  async getStats(): Promise<{
    connected: boolean;
    memory: any;
    info: any;
    keyspace: any;
  }> {
    if (!this.isConnected) {
      return {
        connected: false,
        memory: null,
        info: null,
        keyspace: null,
      };
    }

    try {
      const [memory, info, keyspace] = await Promise.all([
        this.redis.memory('STATS'),
        this.redis.info('memory'),
        this.redis.info('keyspace'),
      ]);

      return {
        connected: true,
        memory: memory,
        info: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return {
        connected: false,
        memory: null,
        info: null,
        keyspace: null,
      };
    }
  }

  private parseRedisInfo(info: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = info.split('\r\n');

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }

    return result;
  }

  // Cache patterns for common use cases
  async cacheUser(userId: string, user: any, ttl = 3600): Promise<boolean> {
    return this.set(`user:${userId}`, user, {
      ttl,
      namespace: 'users',
      tags: ['user', `user:${userId}`],
    });
  }

  async getCachedUser(userId: string): Promise<any> {
    return this.get(`user:${userId}`, { namespace: 'users' });
  }

  async cacheProject(
    projectId: string,
    project: any,
    ttl = 1800,
  ): Promise<boolean> {
    return this.set(`project:${projectId}`, project, {
      ttl,
      namespace: 'projects',
      tags: ['project', `project:${projectId}`],
    });
  }

  async getCachedProject(projectId: string): Promise<any> {
    return this.get(`project:${projectId}`, { namespace: 'projects' });
  }

  async cacheIssues(
    projectId: string,
    issues: any[],
    ttl = 900,
  ): Promise<boolean> {
    return this.set(`issues:${projectId}`, issues, {
      ttl,
      namespace: 'issues',
      tags: ['issues', `project:${projectId}`],
    });
  }

  async getCachedIssues(projectId: string): Promise<any[]> {
    const result = await this.get<any[]>(`issues:${projectId}`, {
      namespace: 'issues',
    });
    return result || [];
  }

  async invalidateProjectCache(projectId: string): Promise<boolean> {
    return this.invalidateByTags([`project:${projectId}`]);
  }

  async invalidateUserCache(userId: string): Promise<boolean> {
    return this.invalidateByTags([`user:${userId}`]);
  }
}
