import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { IssuesService } from '../issues/issues.service';
import { CacheService } from '../cache/cache.service';

interface HeartbeatData {
  ticketId: string;
  projectId: string;
  userId: string;
}

@Processor('telemetry')
export class TelemetryProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetryProcessor.name);

  constructor(
    private readonly issuesService: IssuesService,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async process(job: Job<HeartbeatData, any, string>): Promise<any> {
    switch (job.name) {
      case 'heartbeat':
        return this.handleHeartbeat(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleHeartbeat(data: HeartbeatData) {
    const { ticketId, projectId, userId } = data;
    if (!ticketId || !projectId || !userId) {
      this.logger.warn('Invalid heartbeat data', data);
      return;
    }

    const sessionKey = `telemetry:session:${ticketId}:${userId}`;
    const session = await this.cacheService.get<{ startTime: number }>(
      sessionKey,
    );
    const now = Date.now();

    if (!session) {
      // New session
      await this.cacheService.set(sessionKey, { startTime: now }, { ttl: 300 }); // 5 min TTL
      this.logger.debug(`Started new session for ${ticketId}`);
    } else {
      // Existing session, extend TTL
      await this.cacheService.set(sessionKey, session, { ttl: 300 });

      // Check duration
      const duration = now - session.startTime;
      if (duration > 10 * 60 * 1000) {
        // 10 minutes
        try {
          // Fetch issue to check status
          const issue = await this.issuesService.findOne(
            projectId,
            ticketId,
            userId,
          );
          if (issue.status !== 'In Progress') {
            this.logger.log(
              `Auto-transitioning ticket ${ticketId} to In Progress`,
            );
            await this.issuesService.updateStatus(
              projectId,
              ticketId,
              'In Progress',
              userId,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to auto-transition ticket ${ticketId}`,
            error,
          );
        }
      }
    }
  }
}
