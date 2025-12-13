import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BriefingService } from '../services/briefing.service';

@Injectable()
export class DailyDigestProcessor {
  private readonly logger = new Logger(DailyDigestProcessor.name);

  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    private readonly briefingService: BriefingService,
  ) {}

  // Run at 8:00 AM every day
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async scheduleBriefings() {
    this.logger.log('Running Smart Digest processor...');

    // In a real scenario, we would iterate over all active users or use a cursor
    // For now, we rely on the specific job trigger or use a fixed list for demo
    // Alternatively, SmartDigestService could maintain a SET of users with pending digests
    // But per design, we trigger "process-digest" for users.

    // Mock user list - effectively we might want to scan keys `notifications:staging:*`
    // but that is expensive.
    // Better approach: When staging, add userId to a SET `digest:users`.
    // Then POP from that SET here.

    // Let's implement the Set approach in SmartDigestService in future optimization.
    // For now, let's just use the mock user IDs or pass the logic to the consumer if we want async.
    // But since we are here, let's just trigger for a known user for testing or loop.

    const userIds = ['user-1', 'user-2']; // Placeholder

    for (const userId of userIds) {
      await this.notificationsQueue.add('process-digest', { userId });
    }
  }

  // This should ideally be in a separate Processor class with @Processor
  // But for simplicity/plan we can handle logic here or let a consumer handle it.
  // We need a consumer for 'notifications' queue.
}
