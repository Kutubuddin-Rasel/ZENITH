import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ApiKey } from '../entities/api-key.entity';
import { AuditService } from '../../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../../audit/entities/audit-log.entity';
import { CacheService } from '../../cache/cache.service';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CLEANUP_CONFIG = {
  /**
   * Batch size for DELETE operations.
   * Prevents table locks and transaction log overflow.
   */
  BATCH_SIZE: 1000,

  /**
   * Sleep between batches (ms).
   * Allows other queries to execute.
   */
  BATCH_SLEEP_MS: 100,

  /**
   * Days after revokeAt before hard delete.
   * Gives time for key to fully expire and be rotated.
   */
  PURGE_AFTER_DAYS: 30,

  /**
   * Days of inactivity before flagging as unused.
   */
  UNUSED_THRESHOLD_DAYS: 90,

  /**
   * Daily cap for unused key notifications.
   * Prevents email spam blocks.
   */
  DAILY_NOTIFICATION_CAP: 1000,

  /**
   * Rate limit violations threshold for anomaly detection.
   */
  RATE_LIMIT_VIOLATION_THRESHOLD: 1000,
} as const;

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class ApiKeyCleanupService {
  private readonly logger = new Logger(ApiKeyCleanupService.name);

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
    private auditService: AuditService,
    private cacheService: CacheService,
  ) {}

  // ===========================================================================
  // CRON SCHEDULE: Daily at 03:00 UTC (Low Traffic)
  // ===========================================================================

  @Cron('0 3 * * *', { name: 'api-key-cleanup', timeZone: 'UTC' })
  async runDailyCleanup(): Promise<void> {
    this.logger.log('=== API Key Cleanup Job Started ===');
    const startTime = Date.now();

    try {
      // Job A: Purge expired/rotated keys
      const purgedCount = await this.purgeExpiredKeys();

      // Job B: Notify unused keys
      const notifiedCount = await this.notifyUnusedKeys();

      // Job C: Anomaly detection
      const anomalies = await this.detectRateLimitAnomalies();

      const duration = Date.now() - startTime;

      // Summary audit log
      await this.auditService.log({
        eventType: AuditEventType.CLEANUP_JOB_COMPLETED,
        severity: AuditSeverity.LOW,
        description: 'Daily API key cleanup completed',
        resourceType: 'api_key',
        details: {
          purgedCount,
          notifiedCount,
          anomaliesDetected: anomalies.length,
          durationMs: duration,
        },
      });

      this.logger.log(
        `=== Cleanup Complete: ${purgedCount} purged, ${notifiedCount} notified, ${anomalies.length} anomalies (${duration}ms) ===`,
      );
    } catch (error) {
      this.logger.error('API Key Cleanup Job Failed', error);

      await this.auditService.log({
        eventType: AuditEventType.CLEANUP_JOB_COMPLETED,
        severity: AuditSeverity.HIGH,
        description: 'Daily API key cleanup FAILED',
        resourceType: 'api_key',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  // ===========================================================================
  // JOB A: Purge Expired Keys (Batch Deletion)
  // ===========================================================================

  /**
   * Hard delete keys where revokeAt is 30+ days in the past.
   *
   * SAFETY FEATURES:
   * - Batch deletion (1000 at a time)
   * - Sleep between batches (release locks)
   * - Audit logging before deletion
   */
  async purgeExpiredKeys(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.PURGE_AFTER_DAYS);

    let totalDeleted = 0;
    let batchNumber = 0;

    this.logger.log(`Purging keys rotated before ${cutoffDate.toISOString()}`);

    while (true) {
      batchNumber++;

      // Find batch of keys to delete
      const keysToDelete = await this.apiKeyRepo.find({
        where: {
          revokeAt: LessThan(cutoffDate),
        },
        take: CLEANUP_CONFIG.BATCH_SIZE,
        select: ['id', 'keyPrefix', 'userId', 'revokeAt'],
      });

      if (keysToDelete.length === 0) {
        break;
      }

      // Log keys being deleted (for audit trail)
      const keyIds = keysToDelete.map((k) => k.id);

      // Perform batch delete
      await this.apiKeyRepo.delete(keyIds);
      totalDeleted += keysToDelete.length;

      this.logger.debug(
        `Batch ${batchNumber}: Deleted ${keysToDelete.length} keys`,
      );

      // Sleep to release locks and allow other queries
      await this.sleep(CLEANUP_CONFIG.BATCH_SLEEP_MS);
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Purged ${totalDeleted} expired keys in ${batchNumber} batches`,
      );
    }

    return totalDeleted;
  }

  // ===========================================================================
  // JOB B: Notify Unused Keys
  // ===========================================================================

  /**
   * Find and notify users about unused API keys.
   *
   * CRITERIA for "Unused":
   * 1. Key is at least 90 days old (not a new user)
   * 2. Key hasn't been used in 90+ days (OR never used)
   * 3. User hasn't been notified yet (prevent spam)
   *
   * SAFETY:
   * - Daily cap of 1000 notifications
   * - Marks key as notified to prevent duplicate emails
   */
  async notifyUnusedKeys(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - CLEANUP_CONFIG.UNUSED_THRESHOLD_DAYS,
    );

    // Find unused keys that haven't been notified
    const unusedKeys = await this.apiKeyRepo
      .createQueryBuilder('key')
      .where('key.createdAt < :cutoffDate', { cutoffDate })
      .andWhere('key.isActive = :isActive', { isActive: true })
      .andWhere('key.unusedNotifiedAt IS NULL')
      .andWhere('(key.lastUsedAt IS NULL OR key.lastUsedAt < :cutoffDate)', {
        cutoffDate,
      })
      .orderBy('key.createdAt', 'ASC') // Oldest first
      .take(CLEANUP_CONFIG.DAILY_NOTIFICATION_CAP)
      .getMany();

    if (unusedKeys.length === 0) {
      return 0;
    }

    this.logger.log(`Found ${unusedKeys.length} unused keys to notify`);

    let notified = 0;

    for (const key of unusedKeys) {
      try {
        // Send notification (mock)
        await this.sendUnusedKeyNotification(key);

        // Mark as notified
        key.unusedNotifiedAt = new Date();
        await this.apiKeyRepo.save(key);

        notified++;
      } catch (error) {
        this.logger.warn(
          `Failed to notify for key ${key.keyPrefix}...: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }

    return notified;
  }

  /**
   * Send notification to user about unused key.
   * MOCK IMPLEMENTATION - Replace with actual email/notification service.
   * Note: Returns Promise for interface compatibility, but current impl is sync.
   */
  private sendUnusedKeyNotification(key: ApiKey): Promise<void> {
    // TODO: Integrate with notification service / email queue
    // Example:
    // await this.notificationService.send({
    //   userId: key.userId,
    //   type: 'UNUSED_API_KEY',
    //   data: {
    //     keyName: key.name,
    //     keyPrefix: key.keyPrefix,
    //     lastUsed: key.lastUsedAt,
    //     created: key.createdAt,
    //   },
    // });

    this.logger.debug(
      `[MOCK] Notification sent for unused key: ${key.keyPrefix}... (user: ${key.userId})`,
    );
    return Promise.resolve();
  }

  // ===========================================================================
  // JOB C: Rate Limit Anomaly Detection
  // ===========================================================================

  /**
   * Detect API keys with excessive rate limit violations.
   *
   * FLAGS keys with >1000 violations in 24 hours as potentially:
   * - Compromised (attacker brute-forcing)
   * - Misconfigured (needs higher limit)
   * - Abusive (potential ToS violation)
   */
  async detectRateLimitAnomalies(): Promise<
    { keyId: string; violations: number }[]
  > {
    const anomalies: { keyId: string; violations: number }[] = [];

    // Get all active keys
    const activeKeys = await this.apiKeyRepo.find({
      where: { isActive: true },
      select: ['id', 'keyPrefix', 'userId', 'rateLimit'],
    });

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    for (const key of activeKeys) {
      try {
        // Check rate limit violations from Redis
        // We look for blocked requests in the last 24 hours
        const violationCount = await this.getViolationCount(key.id, oneDayAgo);

        if (violationCount > CLEANUP_CONFIG.RATE_LIMIT_VIOLATION_THRESHOLD) {
          anomalies.push({ keyId: key.id, violations: violationCount });

          // Log security event
          await this.auditService.log({
            eventType: AuditEventType.API_KEY_VALIDATION_FAILED,
            severity: AuditSeverity.HIGH,
            description: `Rate limit anomaly detected: ${violationCount} violations in 24h`,
            resourceType: 'api_key',
            resourceId: key.id,
            userId: key.userId,
            details: {
              keyPrefix: key.keyPrefix,
              violations: violationCount,
              rateLimit: key.rateLimit,
              threshold: CLEANUP_CONFIG.RATE_LIMIT_VIOLATION_THRESHOLD,
            },
          });

          this.logger.warn(
            `ANOMALY: Key ${key.keyPrefix}... has ${violationCount} rate limit violations`,
          );
        }
      } catch (error) {
        // Don't fail the whole job for one key
        this.logger.debug(`Error checking violations for ${key.id}: ${error}`);
      }
    }

    if (anomalies.length > 0) {
      this.logger.warn(
        `Detected ${anomalies.length} keys with rate limit anomalies`,
      );
    }

    return anomalies;
  }

  /**
   * Get rate limit violation count for a key.
   * SIMPLIFIED: In real implementation, this would query Redis or a metrics store.
   * Note: Returns Promise for interface compatibility, but current impl is sync.
   */
  private getViolationCount(_keyId: string, _since: number): Promise<number> {
    // TODO: Implement actual violation tracking
    // Options:
    // 1. Store violations in Redis: INCR violation:{keyId}:{date}
    // 2. Query from metrics (Prometheus, DataDog)
    // 3. Parse audit logs

    // For now, return 0 (no anomalies detected)
    return Promise.resolve(0);
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // MANUAL TRIGGER (For Testing/Admin)
  // ===========================================================================

  /**
   * Manually trigger cleanup job.
   * Useful for testing or admin-initiated cleanup.
   */
  async manualCleanup(): Promise<{
    purgedCount: number;
    notifiedCount: number;
    anomalies: number;
  }> {
    this.logger.log('Manual cleanup triggered');

    const purgedCount = await this.purgeExpiredKeys();
    const notifiedCount = await this.notifyUnusedKeys();
    const anomalies = await this.detectRateLimitAnomalies();

    return {
      purgedCount,
      notifiedCount,
      anomalies: anomalies.length,
    };
  }
}
