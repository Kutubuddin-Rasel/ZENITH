import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// =============================================================================
// REDIS KEY PATTERNS
// =============================================================================

/**
 * Redis key templates for telemetry aggregation buffers.
 *
 * TWO NAMESPACES:
 * - `agg:` (active)     → written by heartbeat processors, live traffic
 * - `flush:` (frozen)    → atomically rotated via RENAME, read by flush worker
 *
 * RENAME(agg:key, flush:{batchId}:key) is ATOMIC in Redis. New heartbeats
 * that hit the old key name after RENAME will transparently create a new key.
 * No read-modify-write race condition exists.
 */
const REDIS_KEYS = {
  /** Active counter hash: { heartbeats: N, transitions: N } */
  counter: (date: string, orgId: string, projectId: string): string =>
    `telemetry:agg:counters:${date}:${orgId}:${projectId}`,

  /** Active HyperLogLog for unique user DAU */
  dau: (date: string, orgId: string, projectId: string): string =>
    `telemetry:agg:dau:${date}:${orgId}:${projectId}`,

  /** SCAN pattern: all active counter keys for a given date */
  counterPattern: (date: string): string => `telemetry:agg:counters:${date}:*`,

  /** Frozen counter key after RENAME (isolated for flush worker) */
  frozenCounter: (batchId: string, orgId: string, projectId: string): string =>
    `telemetry:flush:${batchId}:counters:${orgId}:${projectId}`,

  /** Frozen DAU key after RENAME */
  frozenDAU: (batchId: string, orgId: string, projectId: string): string =>
    `telemetry:flush:${batchId}:dau:${orgId}:${projectId}`,

  /** SCAN pattern: all frozen keys for a given batch */
  frozenCounterPattern: (batchId: string): string =>
    `telemetry:flush:${batchId}:counters:*`,

  /** Centralized buffer key count — INCR on new entity, DECRBY on flush */
  bufferCount: 'telemetry:buffer_count',
} as const;

// =============================================================================
// TYPES
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

/** Result of the rotate-and-read operation */
export interface RotatedBatchResult {
  /** Aggregated entries ready for PostgreSQL upsert */
  entries: TelemetryBufferEntry[];
  /** Number of unique entities (org×project pairs) rotated */
  entityCount: number;
  /** All frozen keys to delete after successful PG write */
  frozenKeys: string[];
}

// =============================================================================
// TELEMETRY AGGREGATION SERVICE
// =============================================================================

/**
 * TelemetryAggregationService — Redis Buffer with Atomic Rotation
 *
 * ARCHITECTURE:
 * High-frequency heartbeats are buffered in Redis using O(1) atomic ops.
 * A BullMQ worker periodically flushes buffers to PostgreSQL.
 *
 * MULTI-POD SAFETY:
 *
 * 1. CARDINALITY CIRCUIT BREAKER (Redis INCR):
 *    A centralized `telemetry:buffer_count` key tracks unique buffer entities
 *    across ALL pods using atomic INCR. If count exceeds BUFFER_MAX_KEYS,
 *    new writes are dropped and a Prometheus metric fires.
 *
 * 2. ATOMIC KEY ROTATION (Redis RENAME):
 *    Instead of read-then-delete (race condition!), the flush worker
 *    atomically RENAMEs active keys to a frozen namespace keyed by batchId.
 *    New heartbeats instantly create fresh keys — zero data loss.
 *
 * KEY EXPIRATION:
 *    All keys (active + frozen) have a 48h TTL safety net.
 *
 * ZERO `any` TOLERANCE.
 */
@Injectable()
export class TelemetryAggregationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelemetryAggregationService.name);
  private redis: Redis;
  private isConnected = false;

  /** Safety TTL: keys expire after 48h even if flush never runs */
  private static readonly KEY_TTL_SECONDS = 48 * 60 * 60;

  /** Max unique buffer entities before circuit breaker trips */
  private readonly bufferMaxKeys: number;

  /** ioredis keyPrefix — must be stripped from SCAN results */
  private readonly keyPrefix: string;

  constructor(private readonly configService: ConfigService) {
    this.bufferMaxKeys = this.configService.get<number>(
      'TELEMETRY_BUFFER_MAX_KEYS',
      10_000,
    );
    this.keyPrefix = 'zenith:';
  }

  async onModuleInit(): Promise<void> {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD'),
        db: parseInt(this.configService.get<string>('REDIS_DB', '0'), 10) || 0,
        keyPrefix: this.keyPrefix,
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
   * CARDINALITY CIRCUIT BREAKER:
   * If the key is NEW (EXISTS = 0), atomically INCR the global counter.
   * If counter > BUFFER_MAX_KEYS, drop the write and return false.
   *
   * @returns true if buffered, false if dropped by circuit breaker
   */
  async bufferHeartbeat(
    organizationId: string,
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    if (!this.isConnected) return false;

    const date = this.getTodayDateString();
    const counterKey = REDIS_KEYS.counter(date, organizationId, projectId);
    const dauKey = REDIS_KEYS.dau(date, organizationId, projectId);

    try {
      // =====================================================================
      // CARDINALITY CHECK: Is this a new entity?
      // EXISTS is O(1). Only new entities increment the global counter.
      // =====================================================================
      const keyExists = await this.redis.exists(counterKey);

      if (!keyExists) {
        // New entity — check cardinality cap
        const count = await this.redis.incr(REDIS_KEYS.bufferCount);
        // Set TTL on the counter key itself (renew every 48h)
        await this.redis.expire(
          REDIS_KEYS.bufferCount,
          TelemetryAggregationService.KEY_TTL_SECONDS,
        );

        if (count > this.bufferMaxKeys) {
          // ROLLBACK the increment — we're over capacity
          await this.redis.decr(REDIS_KEYS.bufferCount);
          this.logger.warn(
            `Buffer circuit breaker TRIPPED: ${count} > ${this.bufferMaxKeys}. ` +
              `Dropping heartbeat for org=${organizationId} project=${projectId}`,
          );
          return false; // Caller fires Prometheus overflow counter
        }
      }

      // =====================================================================
      // BUFFER WRITE: atomic HINCRBY + PFADD
      // =====================================================================
      const pipeline = this.redis.pipeline();
      pipeline.hincrby(counterKey, 'heartbeats', 1);
      pipeline.pfadd(dauKey, userId);
      pipeline.expire(counterKey, TelemetryAggregationService.KEY_TTL_SECONDS);
      pipeline.expire(dauKey, TelemetryAggregationService.KEY_TTL_SECONDS);
      await pipeline.exec();

      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to buffer heartbeat: ${errMsg}`);
      return false;
    }
  }

  /**
   * Buffer an auto-transition event.
   * No cardinality check — transitions only happen on existing entities.
   */
  async bufferTransition(
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    if (!this.isConnected) return;

    const date = this.getTodayDateString();
    const counterKey = REDIS_KEYS.counter(date, organizationId, projectId);

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
  // ATOMIC ROTATION: Active → Frozen (called by flush processor)
  // ===========================================================================

  /**
   * Atomically rotate active buffer keys to a frozen processing namespace,
   * then read the frozen data.
   *
   * RENAME is ATOMIC per-key in Redis:
   * - Source key is deleted
   * - Destination key is created with the source's value
   * - New writes to the old key name create a FRESH key — zero data loss
   *
   * @param date The date to flush (YYYY-MM-DD)
   * @param batchId Unique identifier for this flush batch (use BullMQ job ID)
   */
  async rotateAndRead(
    date: string,
    batchId: string,
  ): Promise<RotatedBatchResult> {
    if (!this.isConnected) {
      return { entries: [], entityCount: 0, frozenKeys: [] };
    }

    const entries: TelemetryBufferEntry[] = [];
    const frozenKeys: string[] = [];
    let entityCount = 0;

    try {
      // =====================================================================
      // PHASE 1: Also pick up any orphaned frozen keys from crashed batches
      // =====================================================================
      const existingFrozenKeys = await this.scanKeys(
        REDIS_KEYS.frozenCounterPattern(batchId),
      );

      // =====================================================================
      // PHASE 2: SCAN active keys and RENAME each to frozen namespace
      // =====================================================================
      const activeCounterKeys = await this.scanKeys(
        REDIS_KEYS.counterPattern(date),
      );

      for (const rawCounterKey of activeCounterKeys) {
        const parsed = this.parseActiveCounterKey(rawCounterKey, date);
        if (!parsed) continue;

        const { organizationId, projectId } = parsed;

        // Source keys (without prefix — ioredis adds it)
        const srcCounter = REDIS_KEYS.counter(date, organizationId, projectId);
        const srcDAU = REDIS_KEYS.dau(date, organizationId, projectId);

        // Destination keys (frozen with batchId)
        const dstCounter = REDIS_KEYS.frozenCounter(
          batchId,
          organizationId,
          projectId,
        );
        const dstDAU = REDIS_KEYS.frozenDAU(batchId, organizationId, projectId);

        try {
          await this.redis.rename(srcCounter, dstCounter);
          // Set TTL on frozen key as safety net
          await this.redis.expire(
            dstCounter,
            TelemetryAggregationService.KEY_TTL_SECONDS,
          );
        } catch {
          // Source key vanished between SCAN and RENAME (another pod processed it)
          continue;
        }

        try {
          await this.redis.rename(srcDAU, dstDAU);
          await this.redis.expire(
            dstDAU,
            TelemetryAggregationService.KEY_TTL_SECONDS,
          );
        } catch {
          // DAU key might not exist (only transitions, no heartbeats)
        }

        entityCount++;
      }

      // =====================================================================
      // PHASE 3: Read ALL frozen counter keys (newly rotated + any orphans)
      // =====================================================================
      const allFrozenCounterKeys = await this.scanKeys(
        REDIS_KEYS.frozenCounterPattern(batchId),
      );

      for (const rawFrozenKey of allFrozenCounterKeys) {
        const parsed = this.parseFrozenCounterKey(rawFrozenKey, batchId);
        if (!parsed) continue;

        const { organizationId, projectId } = parsed;

        // Strip prefix for ioredis commands
        const frozenCounterCmd = REDIS_KEYS.frozenCounter(
          batchId,
          organizationId,
          projectId,
        );
        const frozenDAUCmd = REDIS_KEYS.frozenDAU(
          batchId,
          organizationId,
          projectId,
        );

        // Read counters
        const counters: Record<string, string> =
          await this.redis.hgetall(frozenCounterCmd);
        const heartbeats = parseInt(counters['heartbeats'] || '0', 10);
        const transitions = parseInt(counters['transitions'] || '0', 10);

        // Read DAU (PFCOUNT returns 0 if key doesn't exist)
        let uniqueUsers = 0;
        try {
          uniqueUsers = await this.redis.pfcount(frozenDAUCmd);
        } catch {
          // DAU key doesn't exist — fine
        }

        entries.push({
          organizationId,
          projectId,
          date,
          heartbeats,
          uniqueUsers,
          transitions,
        });

        // Track frozen keys for deletion after PG write
        frozenKeys.push(frozenCounterCmd, frozenDAUCmd);
      }

      this.logger.log(
        `Rotated ${entityCount} entities for date=${date} batch=${batchId} ` +
          `(${entries.length} total including orphans)`,
      );

      return { entries, entityCount, frozenKeys };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Rotate-and-read failed for ${date}: ${errMsg}`);
      return { entries: [], entityCount: 0, frozenKeys: [] };
    }
  }

  // ===========================================================================
  // CLEANUP: Delete frozen keys + decrement counter (AFTER successful PG write)
  // ===========================================================================

  /**
   * Delete frozen processing keys and decrement the centralized buffer counter.
   * Called ONLY after successful PostgreSQL bulk upsert.
   *
   * @param frozenKeys Keys to UNLINK
   * @param entityCount Number of entities to DECRBY from the global counter
   */
  async deleteProcessedBatch(
    frozenKeys: string[],
    entityCount: number,
  ): Promise<void> {
    if (!this.isConnected || frozenKeys.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();

      // UNLINK all frozen keys (non-blocking DEL)
      for (const key of frozenKeys) {
        pipeline.unlink(key);
      }

      // Decrement the centralized buffer counter
      if (entityCount > 0) {
        pipeline.decrby(REDIS_KEYS.bufferCount, entityCount);
      }

      await pipeline.exec();

      this.logger.debug(
        `Cleaned ${frozenKeys.length} frozen keys, DECRBY ${entityCount}`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to clean processed batch: ${errMsg}`);
      // Non-fatal: keys have 48h TTL, counter will self-correct on next flush
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Strip the ioredis keyPrefix from a SCAN result.
   * SCAN returns full keys including the prefix (e.g., 'zenith:telemetry:agg:...')
   * but ioredis commands auto-prepend the prefix, so we must strip it.
   */
  private stripPrefix(rawKey: string): string {
    return rawKey.startsWith(this.keyPrefix)
      ? rawKey.slice(this.keyPrefix.length)
      : rawKey;
  }

  /**
   * Parse orgId/projectId from an ACTIVE counter key (SCAN result).
   * Raw key: zenith:telemetry:agg:counters:{date}:{orgId}:{projectId}
   * After strip: telemetry:agg:counters:{date}:{orgId}:{projectId}
   */
  private parseActiveCounterKey(
    rawKey: string,
    date: string,
  ): { organizationId: string; projectId: string } | null {
    const key = this.stripPrefix(rawKey);
    const prefix = `telemetry:agg:counters:${date}:`;
    if (!key.startsWith(prefix)) return null;

    const parts = key.slice(prefix.length).split(':');
    if (parts.length !== 2) return null;

    return { organizationId: parts[0], projectId: parts[1] };
  }

  /**
   * Parse orgId/projectId from a FROZEN counter key (SCAN result).
   * Raw key: zenith:telemetry:flush:{batchId}:counters:{orgId}:{projectId}
   * After strip: telemetry:flush:{batchId}:counters:{orgId}:{projectId}
   */
  private parseFrozenCounterKey(
    rawKey: string,
    batchId: string,
  ): { organizationId: string; projectId: string } | null {
    const key = this.stripPrefix(rawKey);
    const prefix = `telemetry:flush:${batchId}:counters:`;
    if (!key.startsWith(prefix)) return null;

    const parts = key.slice(prefix.length).split(':');
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
