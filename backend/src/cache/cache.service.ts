import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Counter, Histogram, register } from 'prom-client';
import {
  CachedUser,
  CachedProject,
  CachedIssue,
  RedisStats,
} from './cache.interfaces';
import { IntegrationGateway } from '../core/integrations/integration.gateway';

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

  // ==========================================================================
  // CIRCUIT BREAKER CONFIGURATION (Phase 5 - Cache Module Remediation)
  // ==========================================================================
  private readonly breakerConfig = {
    name: 'redis-cache',
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
  };

  // ==========================================================================
  // PROMETHEUS METRICS (Phase 6 - Cache Module Remediation)
  // Labels: operation (get/set/del), namespace (for hit/miss grouping)
  // WARNING: Do NOT add 'key' as label - creates cardinality explosion
  // ==========================================================================
  private readonly cacheHitsCounter: Counter;
  private readonly cacheMissesCounter: Counter;
  private readonly cacheOperationDuration: Histogram;

  constructor(
    private configService: ConfigService,
    @Optional() private readonly circuitBreaker?: IntegrationGateway,
  ) {
    // Initialize Prometheus metrics
    // Cache hits counter
    this.cacheHitsCounter = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['namespace'],
      registers: [register],
    });

    // Cache misses counter
    this.cacheMissesCounter = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['namespace'],
      registers: [register],
    });

    // Operation duration histogram
    // Redis is fast, so use small buckets (in seconds)
    this.cacheOperationDuration = new Histogram({
      name: 'cache_operation_duration_seconds',
      help: 'Duration of cache operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [register],
    });
  }

  async onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        db: parseInt(this.configService.get('REDIS_DB', '0'), 10) || 0,
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
      } catch (error: unknown) {
        this.logger.warn(
          'Redis not available, cache will be disabled:',
          error instanceof Error ? error.message : 'Unknown error',
        );
        this.isConnected = false;
      }
    } catch (error: unknown) {
      this.logger.warn(
        'Failed to initialize cache service (cache will be disabled):',
        error instanceof Error ? error.message : 'Unknown error',
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

  /**
   * Check Redis connectivity using the shared connection pool.
   * Used by health endpoints to avoid creating new connections per request.
   *
   * @returns 'PONG' if connected, throws if disconnected
   */
  async ping(): Promise<string> {
    if (!this.isConnected || !this.redis) {
      throw new Error('Redis not connected');
    }
    return this.redis.ping();
  }

  /**
   * Check if the cache service is connected (non-throwing check).
   */
  isHealthy(): boolean {
    return this.isConnected;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn('Cache not connected, returning null');
      this.cacheMissesCounter.inc({
        namespace: options?.namespace || 'default',
      });
      return null;
    }

    const namespace = options?.namespace || 'default';
    const endTimer = this.cacheOperationDuration.startTimer({
      operation: 'get',
    });

    const action = async (): Promise<T | null> => {
      const fullKey = this.buildKey(key, options);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        return null; // Cache miss - this is NOT a failure
      }

      return JSON.parse(value) as T;
    };

    // Fallback: return null (simulate cache miss) when circuit is open
    const fallback = (): T | null => {
      this.logger.debug(`Circuit breaker fallback for get: ${key}`);
      return null;
    };

    let result: T | null = null;

    try {
      // Use circuit breaker if available (Phase 5)
      if (this.circuitBreaker) {
        result = await this.circuitBreaker.execute(
          this.breakerConfig,
          action,
          fallback,
        );
      } else {
        // Fallback to direct call if no circuit breaker
        result = await action();
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error getting cache key ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      result = null;
    } finally {
      // Record duration
      endTimer();

      // Record hit or miss (Phase 6)
      if (result !== null) {
        this.cacheHitsCounter.inc({ namespace });
      } else {
        this.cacheMissesCounter.inc({ namespace });
      }
    }

    return result;
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

    const endTimer = this.cacheOperationDuration.startTimer({
      operation: 'set',
    });

    const action = async (): Promise<boolean> => {
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
    };

    // Fallback: return false (fail silently) when circuit is open
    const fallback = (): boolean => {
      this.logger.debug(`Circuit breaker fallback for set: ${key}`);
      return false; // Data won't be cached, but app continues
    };

    try {
      // Use circuit breaker if available (Phase 5)
      if (this.circuitBreaker) {
        return await this.circuitBreaker.execute(
          this.breakerConfig,
          action,
          fallback,
        );
      }

      // Fallback to direct call if no circuit breaker
      return await action();
    } catch (error: unknown) {
      this.logger.error(
        `Error setting cache key ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return false;
    } finally {
      endTimer();
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
    } catch (error: unknown) {
      this.logger.error(
        `Error deleting cache key ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
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
    } catch (error: unknown) {
      this.logger.error(
        `Error checking cache key existence ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
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
    } catch (error: unknown) {
      this.logger.error(
        `Error setting expiration for cache key ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
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
    } catch (error: unknown) {
      this.logger.error(
        `Error getting TTL for cache key ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return -1;
    }
  }

  /**
   * Flush all keys in a namespace using non-blocking SCAN.
   *
   * PERFORMANCE (Cache Module Phase 3):
   * Replaced blocking KEYS command with cursor-based SCAN iteration.
   * - KEYS is O(N) and blocks Redis main thread (platform-wide timeouts at scale)
   * - SCAN iterates in chunks (count: 100), never blocking for more than ~1ms
   * - Deletions are batched in pipelines for network efficiency
   *
   * @param namespace - The namespace prefix to flush (e.g., 'users')
   * @returns true if successful, false otherwise
   */
  async flushNamespace(namespace: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const pattern = `${namespace}:*`;
      let deletedCount = 0;

      // Use SCAN instead of KEYS to avoid blocking Redis
      return new Promise<boolean>((resolve, reject) => {
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100, // Process 100 keys per cursor iteration
        });

        stream.on('data', (keys: string[]) => {
          if (keys.length === 0) return;

          // Use void IIFE to handle async operations in event handler
          void (async () => {
            // Pause stream while we delete to prevent backpressure
            stream.pause();

            try {
              // Use pipeline for batched network efficiency
              const pipeline = this.redis.pipeline();
              for (const key of keys) {
                pipeline.unlink(key); // UNLINK is non-blocking DEL
              }
              await pipeline.exec();
              deletedCount += keys.length;
            } catch (error) {
              this.logger.error(
                `Error deleting batch in namespace ${namespace}:`,
                error instanceof Error ? error.message : 'Unknown error',
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
            `Error scanning namespace ${namespace}:`,
            error.message,
          );
          reject(error);
        });
      });
    } catch (error: unknown) {
      this.logger.error(
        `Error flushing namespace ${namespace}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
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
    } catch (error: unknown) {
      this.logger.error(
        `Error invalidating cache by tags ${tags.join(',')}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
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
    } catch (error: unknown) {
      this.logger.error(
        `Error adding tags to key ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async getStats(): Promise<RedisStats> {
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
    } catch (error: unknown) {
      this.logger.error(
        'Error getting cache stats:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return {
        connected: false,
        memory: null,
        info: null,
        keyspace: null,
      };
    }
  }

  private parseRedisInfo(info: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = info.split('\r\n');

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }

    return result;
  }

  // ==========================================================================
  // DOMAIN CACHE HELPERS (Phase 4 - Typed Interfaces)
  // These are typed wrappers around get/set for common entities.
  // Date fields are strings (JSON serialization reality).
  // ==========================================================================

  async cacheUser(
    userId: string,
    user: CachedUser,
    ttl = 3600,
  ): Promise<boolean> {
    return this.set(`user:${userId}`, user, {
      ttl,
      namespace: 'users',
      tags: ['user', `user:${userId}`],
    });
  }

  async getCachedUser(userId: string): Promise<CachedUser | null> {
    return this.get<CachedUser>(`user:${userId}`, { namespace: 'users' });
  }

  async cacheProject(
    projectId: string,
    project: CachedProject,
    ttl = 1800,
  ): Promise<boolean> {
    return this.set(`project:${projectId}`, project, {
      ttl,
      namespace: 'projects',
      tags: ['project', `project:${projectId}`],
    });
  }

  async getCachedProject(projectId: string): Promise<CachedProject | null> {
    return this.get<CachedProject>(`project:${projectId}`, {
      namespace: 'projects',
    });
  }

  async cacheIssues(
    projectId: string,
    issues: CachedIssue[],
    ttl = 900,
  ): Promise<boolean> {
    return this.set(`issues:${projectId}`, issues, {
      ttl,
      namespace: 'issues',
      tags: ['issues', `project:${projectId}`],
    });
  }

  async getCachedIssues(projectId: string): Promise<CachedIssue[]> {
    const result = await this.get<CachedIssue[]>(`issues:${projectId}`, {
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

  // --- List Operations ---

  async lpush(
    key: string,
    value: any,
    options?: CacheOptions,
  ): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const fullKey = this.buildKey(key, options);
      const serializedValue = JSON.stringify(value);
      const length = await this.redis.lpush(fullKey, serializedValue);
      if (options?.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }
      return length;
    } catch (error) {
      this.logger.error(`Error lpush to ${key}`, error);
      return 0;
    }
  }

  async rpush(
    key: string,
    value: any,
    options?: CacheOptions,
  ): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const fullKey = this.buildKey(key, options);
      const serializedValue = JSON.stringify(value);
      const length = await this.redis.rpush(fullKey, serializedValue);
      if (options?.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }
      return length;
    } catch (error) {
      this.logger.error(`Error rpush to ${key}`, error);
      return 0;
    }
  }

  async lrange<T>(
    key: string,
    start: number,
    stop: number,
    options?: CacheOptions,
  ): Promise<T[]> {
    if (!this.isConnected) return [];
    try {
      const fullKey = this.buildKey(key, options);
      const items = await this.redis.lrange(fullKey, start, stop);
      return items.map((item) => JSON.parse(item) as T);
    } catch (error) {
      this.logger.error(`Error lrange from ${key}`, error);
      return [];
    }
  }

  async llen(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const fullKey = this.buildKey(key, options);
      return await this.redis.llen(fullKey);
    } catch (error) {
      this.logger.error(`Error llen for ${key}`, error);
      return 0;
    }
  }

  // --- Atomic Counter Operations ---

  async incr(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const fullKey = this.buildKey(key, options);
      const value = await this.redis.incr(fullKey);

      // If new key (value === 1) AND ttl provided, set expiration
      if (value === 1 && options?.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }
      return value;
    } catch (error) {
      this.logger.error(`Error incr ${key}`, error);
      return 0;
    }
  }

  async decr(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const fullKey = this.buildKey(key, options);
      const value = await this.redis.decr(fullKey);

      // If new key (value === -1) AND ttl provided, set expiration
      if (value === -1 && options?.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }
      return value;
    } catch (error) {
      this.logger.error(`Error decr ${key}`, error);
      return 0;
    }
  }

  // ==========================================================================
  // ROLLING WINDOW COUNTERS (Phase 2 - Common Module Remediation)
  // Used for distributed failure tracking with automatic expiration
  // ==========================================================================

  /**
   * Atomically increment a counter and ALWAYS reset its TTL.
   *
   * Unlike `incr()` which only sets TTL on first increment, this method
   * resets the TTL on EVERY increment. This creates a "rolling window"
   * where the counter expires after N seconds of inactivity.
   *
   * USE CASE: Distributed failure tracking.
   * - Each failure increments the counter and extends the window.
   * - If the system is healthy for `ttlSeconds`, the counter expires (resets).
   *
   * @param key - The counter key (e.g., 'alert:failures:integration-123')
   * @param ttlSeconds - Rolling window duration in seconds
   * @param options - Optional cache options (namespace)
   * @returns New counter value (1 = first failure in window)
   */
  async incrWithRollingWindow(
    key: string,
    ttlSeconds: number,
    options?: CacheOptions,
  ): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = this.buildKey(key, options);

      // Use Redis pipeline for atomicity
      const pipeline = this.redis.pipeline();
      pipeline.incr(fullKey);
      pipeline.expire(fullKey, ttlSeconds);

      const results = await pipeline.exec();

      // Extract the incremented value from pipeline results
      // results[0] = [error, value] for INCR command
      if (results && results[0] && results[0][1] !== undefined) {
        return results[0][1] as number;
      }

      return 0;
    } catch (error) {
      this.logger.error(
        `Error incrementing rolling window counter ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return 0;
    }
  }

  /**
   * Get the current value of a counter without incrementing.
   *
   * @param key - The counter key
   * @param options - Optional cache options
   * @returns Current counter value, or 0 if not set
   */
  async getCounter(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected) return 0;

    try {
      const fullKey = this.buildKey(key, options);
      const value = await this.redis.get(fullKey);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      this.logger.error(
        `Error getting counter ${key}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return 0;
    }
  }
}
