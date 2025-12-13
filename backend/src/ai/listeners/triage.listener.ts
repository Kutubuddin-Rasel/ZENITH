import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TriageListener {
  private readonly logger = new Logger(TriageListener.name);

  constructor(@InjectQueue('ai-triage') private triageQueue: Queue) {}

  @OnEvent('issue.created')
  async handleIssueCreatedEvent(payload: {
    issueId: string;
    projectId: string;
  }) {
    this.logger.log(`Queueing triage for issue ${payload.issueId}`);
    try {
      await this.triageQueue.add(
        'triage-issue',
        { issueId: payload.issueId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    } catch (error) {
      this.logger.error('Failed to queue issue for triage', error);
    }
  }
}
