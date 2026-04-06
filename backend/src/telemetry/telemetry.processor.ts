import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { IssuesService } from '../issues/issues.service';
import { CacheService } from '../cache/cache.service';

// =============================================================================
// HEARTBEAT JOB DATA (Matches HeartbeatDto shape)
// =============================================================================

/**
 * Typed job payload for heartbeat processing.
 * Mirrors HeartbeatDto — by the time data reaches the worker,
 * it has already been validated by the controller's ValidationPipe.
 */
interface HeartbeatJobData {
  ticketId: string;
  projectId: string;
  userId: string;
}

/** Shape of the cached session object */
interface TelemetrySession {
  startTime: number;
}

// =============================================================================
// PROCESSOR
// =============================================================================

/** Auto-transition threshold: 10 minutes of continuous activity */
const AUTO_TRANSITION_THRESHOLD_MS = 10 * 60 * 1000;

/** Redis session TTL: 5 minutes (re-extended on each heartbeat) */
const SESSION_TTL_SECONDS = 300;

@Processor('telemetry')
export class TelemetryProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetryProcessor.name);

  constructor(
    private readonly issuesService: IssuesService,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async process(job: Job<HeartbeatJobData, void, string>): Promise<void> {
    switch (job.name) {
      case 'heartbeat':
        return this.handleHeartbeat(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleHeartbeat(data: HeartbeatJobData): Promise<void> {
    const { ticketId, projectId, userId } = data;
    if (!ticketId || !projectId || !userId) {
      this.logger.warn('Invalid heartbeat data', data);
      return;
    }

    const sessionKey = `telemetry:session:${ticketId}:${userId}`;
    const session = await this.cacheService.get<TelemetrySession>(sessionKey);
    const now = Date.now();

    if (!session) {
      // New session
      await this.cacheService.set(
        sessionKey,
        { startTime: now },
        { ttl: SESSION_TTL_SECONDS },
      );
      this.logger.debug(`Started new session for ${ticketId}`);
    } else {
      // Existing session, extend TTL
      await this.cacheService.set(sessionKey, session, {
        ttl: SESSION_TTL_SECONDS,
      });

      // Check duration for auto-transition
      const duration = now - session.startTime;
      if (duration > AUTO_TRANSITION_THRESHOLD_MS) {
        try {
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
          const errMsg =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to auto-transition ticket ${ticketId}: ${errMsg}`,
          );
        }
      }
    }
  }
}
