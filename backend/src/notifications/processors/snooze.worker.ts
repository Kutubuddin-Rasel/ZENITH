import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications.service';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Snooze Worker
 * Handles scheduled unsnooze jobs for notifications
 */
@Processor('notifications')
export class SnoozeWorker extends WorkerHost {
  private readonly logger = new Logger(SnoozeWorker.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {
    super();
  }

  async process(
    job: Job<{ notificationId: string; action: string }>,
  ): Promise<void> {
    const { notificationId, action } = job.data;

    if (action === 'unsnooze') {
      this.logger.log(`Processing unsnooze for notification ${notificationId}`);

      const notification =
        await this.notificationsService.unsnooze(notificationId);
      if (notification) {
        this.logger.log(`Unsnoozed notification ${notificationId}`);
      } else {
        this.logger.warn(
          `Notification ${notificationId} not found for unsnooze`,
        );
      }
    }
  }

  /**
   * Schedule unsnooze job with BullMQ delay
   */
  async scheduleUnsnooze(
    notificationId: string,
    delayMs: number,
  ): Promise<void> {
    await this.notificationQueue.add(
      'unsnooze',
      { notificationId, action: 'unsnooze' },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: false,
        jobId: `unsnooze-${notificationId}`, // Prevent duplicates
      },
    );

    this.logger.log(
      `Scheduled unsnooze for notification ${notificationId} in ${Math.round(delayMs / 60000)} minutes`,
    );
  }

  /**
   * Cron job to check for due snoozed notifications
   * Fallback for BullMQ delays - runs every 5 minutes
   */
  @Cron('*/5 * * * *')
  async checkDueSnoozedNotifications(): Promise<void> {
    const dueNotifications =
      await this.notificationsService.getDueSnoozedNotifications();

    if (dueNotifications.length > 0) {
      this.logger.log(
        `Found ${dueNotifications.length} due snoozed notifications`,
      );

      for (const notification of dueNotifications) {
        await this.notificationsService.unsnooze(notification.id);
      }
    }
  }
}
