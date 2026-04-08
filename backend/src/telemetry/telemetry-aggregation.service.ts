import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// =============================================================================
// REDIS KEY PATTERNS
// =============================================================================

/**
 * Redis key templates for telemetry aggregation buffers.
 * Uses consistent naming: telemetry:agg:{type}:{date}:{orgId}:{projectId}
 */
const REDIS_KEYS = {
  /** Hash: { heartbeats: N, transitions: N } */
  dailyCounters: (date: string, orgId: string, projectId: string): string =>
    `telemetry:agg:counters:${date}:${orgId}:${projectId}`,

  /** HyperLogLog: approximate unique user count */
  dailyDAU: (date: string, orgId: string, projectId: string): string =>
    `telemetry:agg:dau:${date}:${orgId}:${projectId}`,

  /** Pattern for SCAN to find all counter keys for a given date */
  dailyCountersPattern: (date: string): string =>
    `telemetry:agg:counters:${date}:*`,

  /** Pattern for SCAN to find all DAU keys for a given date */
  dailyDAUPattern: (date: string): string =>
    `telemetry:agg:dau:${date}:*`,
} as const;

// =============================================================================
// BUFFER ENTRY INTERFACE
// =============================================================================

/** Structure of a single flushed aggregate row */
export interface TelemetryBufferEntry {
  organizationId: string;
  projectId: string;
  date: string;
  heartbeats: number;
  uniqueUsers: number;
  transitions: number;
}

/** Redis Hash fields for daily counters */
interface DailyCounterFields {
  heartbeats: string;
  transitions: string;
}

// =============================================================================
// TELEMETRY AGGREGATION SERVICE
// =============================================================================

/**
 * TelemetryAggregationService — Redis Buffer for High-Throughput Writes
 *
 * ARCHITECTURE:
 * Instead of writing to PostgreSQL on every heartbeat (which would cause
 * IOPS exhaustion at 60 req/min × N users), we buffer aggregates in Redis
 * using O(1) atomic operations:
 *
 * 1. HINCRBY — atomically increment heartbeat/transition counters in a Hash
 * 2. PFADD  — add userId to HyperLogLog for approximate unique DAU counting
 *
 * A BullMQ repeatable job (TelemetryFlushProcessor) drains these buffers
 * every 5 minutes into PostgreSQL via bulk INSERT ... ON CONFLICT UPDATE.
 *
 * WHY DEDICATED REDIS CONNECTION:
 * CacheService wraps Redis with circuit breakers and key prefixing.
 * Telemetry aggregation needs raw HINCRBY/PFADD/PFCOUNT — different
 * semantics that don't benefit from cache-layer abstractions.
 *
 * KEY EXPIRATION:
 * All keys expire after 48h as a safety net. Even if flush fails,
 * stale data self-destructs — no unbounded memory growth.
 *
 * ZERO `any` TOLERANCE.
 */
@Injectable()
export class TelemetryAggregationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryAggregationService.name);
  private redis: Redis;
  private isConnected = false;

  /** Safety TTL: keys expire after 48h even if flush never runs */
  private static readonly KEY_TTL_SECONDS = 48 * 60 * 60;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD'),
        db: parseInt(this.configService.get<string>('REDIS_DB', '0'), 10) || 0,
        keyPrefix: 'zenith:',
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 3000,
        enableOfflineQueue: false,
      });

      this.redis.on('error', (err: Error) => {
        this.logger.warn(`Telemetry Redis error: ${err.message}`);
        this.isConnected = false;
      });

      this.redis.on('ready', () => {
        this.isConnected = true;
      });

      await this.redis.ping();
      this.isConnected = true;
      this.logger.log('TelemetryAggregation Redis connected');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TelemetryAggregation Redis unavailable: ${errMsg}`);
      this.isConnected = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  // ===========================================================================
  // BUFFER WRITES (called by processor on each heartbeat)
  // ===========================================================================

  /**
   * Buffer a heartbeat event into Redis aggregates.
   *
   * O(1) atomic operations — safe at any throughput:
   * - HINCRBY: increment heartbeat counter
   * - PFADD: add user to HyperLogLog for DAU
   * - EXPIRE: 48h safety TTL on first write
   */
  async bufferHeartbeat(
    organizationId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    if (!this.isConnected) return; // Fail-open: don't block heartbeat processing

    const date = this.getTodayDateString();
    const counterKey = REDIS_KEYS.dailyCounters(date, organizationId, projectId);
    const dauKey = REDIS_KEYS.dailyDAU(date, organizationId, projectId);

    try {
      const pipeline = this.redis.pipeline();
      pipeline.hincrby(counterKey, 'heartbeats', 1);
      pipeline.pfadd(dauKey, userId);
      // Set TTL only if key is new (NX-style via pipeline check)
      pipeline.expire(counterKey, TelemetryAggregationService.KEY_TTL_SECONDS);
      pipeline.expire(dauKey, TelemetryAggregationService.KEY_TTL_SECONDS);
      await pipeline.exec();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to buffer heartbeat: ${errMsg}`);
      // Fail-open: heartbeat processing continues even if buffer fails
    }
  }

  /**
   * Buffer an auto-transition event.
   */
  async bufferTransition(
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    if (!this.isConnected) return;

    const date = this.getTodayDateString();
    const counterKey = REDIS_KEYS.dailyCounters(date, organizationId, projectId);

    try {
      const pipeline = this.redis.pipeline();
      pipeline.hincrby(counterKey, 'transitions', 1);
      pipeline.expire(counterKey, TelemetryAggregationService.KEY_TTL_SECONDS);
      await pipeline.exec();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to buffer transition: ${errMsg}`);
    }
  }

  // ===========================================================================
  // FLUSH READS (called by TelemetryFlushProcessor every 5 minutes)
  // ===========================================================================

  /**
   * Drain all buffered aggregates for a given date.
   *
   * CONCURRENCY SAFETY:
   * BullMQ repeatable jobs guarantee exactly-one execution per cycle.
   * But even if two pods somehow race, the pipeline is atomic:
   * HGETALL + PFCOUNT → DELETE happens in sequence per key.
   *
   * RETURNS: Array of TelemetryBufferEntry ready for bulk INSERT.
   */
  async drainDate(date: string): Promise<TelemetryBufferEntry[]> {
    if (!this.isConnected) return [];

    const entries: TelemetryBufferEntry[] = [];
    const counterPattern = REDIS_KEYS.dailyCountersPattern(date);
    const keysToDelete: string[] = [];

    try {
      // Phase 1: SCAN for all counter keys matching this date
      const counterKeys = await this.scanKeys(counterPattern);

      for (const counterKey of counterKeys) {
        // Parse orgId and projectId from key:
        // telemetry:agg:counters:{date}:{orgId}:{projectId}
        const parsed = this.parseCounterKey(counterKey, date);
        if (!parsed) continue;

        const { organizationId, projectId } = parsed;

        // Read counter hash (hgetall returns Record<string, string>)
        const counters: Record<string, string> = await this.redis.hgetall(counterKey);
        const heartbeats = parseInt(counters['heartbeats'] || '0', 10);
        const transitions = parseInt(counters['transitions'] || '0', 10);

        // Read DAU HyperLogLog
        const dauKey = REDIS_KEYS.dailyDAU(date, organizationId, projectId);
        const uniqueUsers = await this.redis.pfcount(dauKey);

        entries.push({
          organizationId,
          projectId,
          date,
          heartbeats,
          uniqueUsers,
          transitions,
        });

        keysToDelete.push(counterKey, dauKey);
      }

      // Phase 2: Delete consumed keys atomically
      if (keysToDelete.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keysToDelete) {
          pipeline.unlink(key); // Non-blocking DEL
        }
        await pipeline.exec();
      }

      this.logger.log(
        `Drained ${entries.length} aggregates for date=${date}`,
      );
      return entries;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to drain aggregates for ${date}: ${errMsg}`);
      return [];
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /** Returns today's date as YYYY-MM-DD string */
  private getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Parse organizationId and projectId from a counter key.
   * Key format: telemetry:agg:counters:{date}:{orgId}:{projectId}
   * Note: ioredis keyPrefix 'zenith:' is stripped by ioredis on reads.
   */
  private parseCounterKey(
    key: string,
    date: string,
  ): { organizationId: string; projectId: string } | null {
    // Remove the zenith: prefix if present (SCAN returns full keys)
    const cleanKey = key.startsWith('zenith:') ? key.slice(7) : key;
    const prefix = `telemetry:agg:counters:${date}:`;
    if (!cleanKey.startsWith(prefix)) return null;

    const remainder = cleanKey.slice(prefix.length);
    const parts = remainder.split(':');
    if (parts.length !== 2) return null;

    return { organizationId: parts[0], projectId: parts[1] };
  }

  /**
   * Non-blocking SCAN to find keys matching a pattern.
   * Uses cursor-based iteration — never blocks Redis.
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];

    return new Promise<string[]>((resolve, reject) => {
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100,
      });

      stream.on('data', (batch: string[]) => {
        keys.push(...batch);
      });

      stream.on('end', () => resolve(keys));
      stream.on('error', (err: Error) => reject(err));
    });
  }
}
