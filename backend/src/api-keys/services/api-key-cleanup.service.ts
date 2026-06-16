import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { API_KEY_AUDIT_TOKEN } from '../constants/api-keys.tokens';
import { ApiKey } from '../entities/api-key.entity';
import {
  API_KEY_EVENTS,
  ApiKeyPurgedEvent,
  ApiKeyUnusedDetectedEvent,
} from '../events/api-keys-events';
import { IApiKeyAuditLogger } from '../interfaces/api-keys.interfaces';
import { AbstractApiKeyRepository } from '../repositories/abstract/api-key.repository.abstract';
import { toSummary } from './api-key.mapper';

const CLEANUP_CONFIG = {
  BATCH_SIZE: 1000,
  BATCH_SLEEP_MS: 100,
  PURGE_AFTER_DAYS: 30,
  UNUSED_THRESHOLD_DAYS: 90,
  DAILY_NOTIFICATION_CAP: 1000,
  RATE_LIMIT_VIOLATION_THRESHOLD: 1000,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ApiKeyCleanupService {
  private readonly logger = new Logger(ApiKeyCleanupService.name);

  constructor(
    private readonly apiKeyRepo: AbstractApiKeyRepository,
    @Inject(API_KEY_AUDIT_TOKEN)
    private readonly audit: IApiKeyAuditLogger,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('0 3 * * *', { name: 'api-key-cleanup', timeZone: 'UTC' })
  async runDailyCleanup(): Promise<void> {
    this.logger.log('=== API Key Cleanup Job Started ===');
    const startTime = Date.now();

    try {
      const purgedCount = await this.purgeExpiredKeys();
      const notifiedCount = await this.notifyUnusedKeys();
      const anomalies = await this.detectRateLimitAnomalies();
      const duration = Date.now() - startTime;

      await this.audit.logCleanupSummary({
        purgedCount,
        notifiedCount,
        anomalies: anomalies.length,
        durationMs: duration,
      });

      this.logger.log(
        `=== Cleanup Complete: ${purgedCount} purged, ${notifiedCount} notified, ${anomalies.length} anomalies (${duration}ms) ===`,
      );
    } catch (error) {
      this.logger.error('API Key Cleanup Job Failed', error);
      await this.audit.logCleanupSummary({
        purgedCount: 0,
        notifiedCount: 0,
        anomalies: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async purgeExpiredKeys(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.PURGE_AFTER_DAYS);

    let totalDeleted = 0;
    let batchNumber = 0;

    this.logger.log(`Purging keys rotated before ${cutoffDate.toISOString()}`);

    while (true) {
      batchNumber++;
      const keysToDelete = await this.apiKeyRepo.findExpiredBefore(
        cutoffDate,
        CLEANUP_CONFIG.BATCH_SIZE,
      );
      if (keysToDelete.length === 0) break;

      const keyIds = keysToDelete.map((k) => k.id);
      await this.apiKeyRepo.batchDelete(keyIds);
      totalDeleted += keysToDelete.length;

      for (const purged of keysToDelete) {
        const event: ApiKeyPurgedEvent = {
          key: {
            id: purged.id,
            name: '',
            keyPrefix: purged.keyPrefix,
            userId: purged.userId,
            projectId: null,
            scopes: [],
            lastUsedAt: null,
            expiresAt: null,
            rateLimit: 0,
            allowedIps: null,
            revokeAt: purged.revokeAt ?? null,
            rotatedToKeyId: null,
            isActive: false,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          },
          timestamp: new Date(),
        };
        this.eventEmitter.emit(API_KEY_EVENTS.PURGED, event);
      }

      this.logger.debug(
        `Batch ${batchNumber}: Deleted ${keysToDelete.length} keys`,
      );
      await this.sleep(CLEANUP_CONFIG.BATCH_SLEEP_MS);
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Purged ${totalDeleted} expired keys in ${batchNumber} batches`,
      );
    }
    return totalDeleted;
  }

  async notifyUnusedKeys(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - CLEANUP_CONFIG.UNUSED_THRESHOLD_DAYS,
    );

    const unusedKeys = await this.apiKeyRepo.findUnusedCandidates(
      cutoffDate,
      CLEANUP_CONFIG.DAILY_NOTIFICATION_CAP,
    );

    if (unusedKeys.length === 0) return 0;
    this.logger.log(`Found ${unusedKeys.length} unused keys to notify`);

    let notified = 0;
    const now = new Date();

    for (const key of unusedKeys) {
      try {
        await this.sendUnusedKeyNotification(key);
        await this.apiKeyRepo.markUnusedNotified(key.id, now);

        const summary = toSummary({ ...key, unusedNotifiedAt: now });
        const event: ApiKeyUnusedDetectedEvent = {
          key: summary,
          daysUnused: this.daysSince(key.lastUsedAt ?? key.createdAt),
          timestamp: now,
        };
        this.eventEmitter.emit(API_KEY_EVENTS.UNUSED_DETECTED, event);

        notified++;
      } catch (error) {
        this.logger.warn(
          `Failed to notify for key ${key.keyPrefix}...: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }
    }

    return notified;
  }

  private sendUnusedKeyNotification(key: ApiKey): Promise<void> {
    this.logger.debug(
      `[MOCK] Notification sent for unused key: ${key.keyPrefix}... (user: ${key.userId})`,
    );
    return Promise.resolve();
  }

  async detectRateLimitAnomalies(): Promise<
    { keyId: string; violations: number }[]
  > {
    const anomalies: { keyId: string; violations: number }[] = [];
    const activeKeys = await this.apiKeyRepo.findAllActive();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    for (const key of activeKeys) {
      try {
        const violationCount = await this.getViolationCount(key.id, oneDayAgo);

        if (violationCount > CLEANUP_CONFIG.RATE_LIMIT_VIOLATION_THRESHOLD) {
          anomalies.push({ keyId: key.id, violations: violationCount });

          await this.audit.logRateLimitAnomaly({
            keyId: key.id,
            userId: key.userId,
            organizationId: null,
            keyPrefix: key.keyPrefix,
            rateLimit: key.rateLimit,
            violations: violationCount,
            threshold: CLEANUP_CONFIG.RATE_LIMIT_VIOLATION_THRESHOLD,
          });

          this.logger.warn(
            `ANOMALY: Key ${key.keyPrefix}... has ${violationCount} rate limit violations`,
          );
        }
      } catch (error) {
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

  private getViolationCount(_keyId: string, _since: number): Promise<number> {
    return Promise.resolve(0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private daysSince(date: Date | null | undefined): number {
    if (!date) return CLEANUP_CONFIG.UNUSED_THRESHOLD_DAYS;
    return Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
  }

  async manualCleanup(): Promise<{
    purgedCount: number;
    notifiedCount: number;
    anomalies: number;
  }> {
    this.logger.log('Manual cleanup triggered');
    const purgedCount = await this.purgeExpiredKeys();
    const notifiedCount = await this.notifyUnusedKeys();
    const anomalies = await this.detectRateLimitAnomalies();
    return { purgedCount, notifiedCount, anomalies: anomalies.length };
  }
}
