import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BriefingService } from '../services/briefing.service';
import { SmartDigestService } from '../services/smart-digest.service';
import { Logger } from '@nestjs/common';

@Processor('notifications')
export class NotificationsConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationsConsumer.name);

  constructor(
    private readonly briefingService: BriefingService,
    private readonly smartDigestService: SmartDigestService,
  ) {
    super();
  }

  async process(job: Job<{ userId: string }, any, string>): Promise<any> {
    switch (job.name) {
      case 'generate-briefing':
        return this.briefingService.generateDailyBriefing(job.data.userId);

      case 'process-digest':
        this.logger.log(`Processing digest for user ${job.data.userId}`);
        return this.smartDigestService.processDigest(job.data.userId);

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
