import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CacheService } from '../../cache/cache.service';
import { NotificationType } from '../entities/notification.entity';
import { NotificationsService } from '../notifications.service';

export interface StagedNotification {
  message: string;
  context: { projectId?: string; [key: string]: any };
  type: NotificationType;
  createdAt: Date;
}

const DEBOUNCE_DELAY_MS = 15 * 60 * 1000; // 15 minutes
const STAGING_TTL = 86400; // 24 hours

@Injectable()
export class SmartDigestService {
  private readonly logger = new Logger(SmartDigestService.name);

  constructor(
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications')
    private readonly notificationQueue: Queue,
  ) {}

  /**
   * Stage a notification for later digest delivery with debounce.
   * If this is the first notification in the batch, schedules a 15-min delayed job.
   */
  async stageNotification(
    userId: string,
    item: StagedNotification,
  ): Promise<void> {
    const key = `notifications:staging:${userId}`;
    const debounceKey = `notifications:debounce:${userId}`;

    // Check if this is the first notification in the batch
    const isFirstInBatch = !(await this.cacheService.exists(debounceKey));

    // Stage the notification
    await this.cacheService.rpush(key, item, { ttl: STAGING_TTL });

    // If first in batch, schedule a delayed job for 15 minutes
    if (isFirstInBatch) {
      await this.scheduleDebounceDigest(userId);
      // Set debounce marker (expires after 15 minutes)
      await this.cacheService.set(debounceKey, Date.now(), {
        ttl: DEBOUNCE_DELAY_MS / 1000,
      });
    }
  }

  /**
   * Schedule a delayed job to process the digest
   */
  private async scheduleDebounceDigest(userId: string): Promise<void> {
    const jobId = `digest-${userId}`;

    // Check if a job already exists for this user
    const existingJob = await this.notificationQueue.getJob(jobId);
    if (existingJob) {
      this.logger.debug(`Digest job already scheduled for user ${userId}`);
      return;
    }

    await this.notificationQueue.add(
      'process-digest',
      { userId },
      {
        delay: DEBOUNCE_DELAY_MS,
        jobId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(`Scheduled digest for user ${userId} in 15 minutes`);
  }

  /**
   * Check if user has pending notifications.
   */
  async hasPending(userId: string): Promise<boolean> {
    const key = `notifications:staging:${userId}`;
    const len = await this.cacheService.llen(key);
    return len > 0;
  }

  /**
   * Get count of pending notifications.
   */
  async getPendingCount(userId: string): Promise<number> {
    const key = `notifications:staging:${userId}`;
    return this.cacheService.llen(key);
  }

  /**
   * Process and flush pending notifications for a user into a single Digest.
   */
  async processDigest(userId: string): Promise<void> {
    const key = `notifications:staging:${userId}`;
    const debounceKey = `notifications:debounce:${userId}`;

    const items = await this.cacheService.lrange<StagedNotification>(
      key,
      0,
      -1,
    );

    if (!items || items.length === 0) {
      // Clean up debounce key even if no items
      await this.cacheService.del(debounceKey);
      return;
    }

    // Group by Project (assuming context.projectId exists)
    const byProject: Record<string, number> = {};
    let otherCount = 0;

    for (const item of items) {
      if (item.context && item.context.projectId) {
        const pid = item.context.projectId; // In real app, name would be better
        byProject[pid] = (byProject[pid] || 0) + 1;
      } else {
        otherCount++;
      }
    }

    // Synthesize Message
    const projectSummaries = Object.entries(byProject).map(
      ([pid, count]) => `${count} updates in project ${pid.substring(0, 8)}`,
    );
    let summary = 'Smart Digest: ';
    if (projectSummaries.length > 0) {
      summary += projectSummaries.join(', ');
      if (otherCount > 0) summary += ` and ${otherCount} other updates.`;
    } else {
      summary += `${items.length} new updates available.`;
    }

    // Create Digest Notification
    await this.notificationsService.createMany(
      [userId],
      summary,
      { type: 'digest', count: items.length },
      NotificationType.INFO,
    );

    // Clear Staging and Debounce
    await this.cacheService.del(key);
    await this.cacheService.del(debounceKey);

    this.logger.log(
      `Generated digest for user ${userId} with ${items.length} items`,
    );
  }
}
