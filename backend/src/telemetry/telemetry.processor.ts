import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { context, trace, SpanStatusCode, propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import { IssuesService } from '../issues/issues.service';
import { CacheService } from '../cache/cache.service';
import { TelemetryMetricsService } from './telemetry-metrics.service';
import { HeartbeatJobPayload, TraceCarrier } from './telemetry.service';

// =============================================================================
// SESSION TYPES
// =============================================================================

/** Shape of the cached session object */
interface TelemetrySession {
  startTime: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Auto-transition threshold: 10 minutes of continuous activity */
const AUTO_TRANSITION_THRESHOLD_MS = 10 * 60 * 1000;

/** Redis session TTL: 5 minutes (re-extended on each heartbeat) */
const SESSION_TTL_SECONDS = 300;

// =============================================================================
// PROCESSOR
// =============================================================================

@Processor('telemetry')
export class TelemetryProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetryProcessor.name);
  private readonly tracer = trace.getTracer('zenith-telemetry-worker');

  constructor(
    private readonly issuesService: IssuesService,
    private readonly cacheService: CacheService,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {
    super();
  }

  async process(job: Job<HeartbeatJobPayload, void, string>): Promise<void> {
    switch (job.name) {
      case 'heartbeat':
        return this.handleHeartbeat(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleHeartbeat(data: HeartbeatJobPayload): Promise<void> {
    // =========================================================================
    // OTEL: Restore trace context from BullMQ job payload
    // This creates a child span linked to the original HTTP request
    // =========================================================================
    const parentContext = data._traceCarrier
      ? propagation.extract(ROOT_CONTEXT, data._traceCarrier as TraceCarrier)
      : ROOT_CONTEXT;

    const span = this.tracer.startSpan(
      'telemetry.processHeartbeat',
      {
        attributes: {
          'telemetry.ticket_id': data.ticketId,
          'telemetry.project_id': data.projectId,
        },
      },
      parentContext,
    );

    // Prometheus: Start processing timer
    const stopTimer = this.telemetryMetrics.startProcessingTimer();

    return context.with(trace.setSpan(parentContext, span), async () => {
      try {
        const { ticketId, projectId, userId } = data;
        if (!ticketId || !projectId || !userId) {
          this.logger.warn('Invalid heartbeat data', data);
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid heartbeat data' });
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
          span.addEvent('session.created');
          this.telemetryMetrics.incrementActiveSession();
          this.logger.debug(`Started new session for ${ticketId}`);
        } else {
          // Existing session, extend TTL
          await this.cacheService.set(sessionKey, session, {
            ttl: SESSION_TTL_SECONDS,
          });

          // Check duration for auto-transition
          const duration = now - session.startTime;
          span.setAttribute('telemetry.session_duration_ms', duration);

          if (duration > AUTO_TRANSITION_THRESHOLD_MS) {
            await this.attemptAutoTransition(projectId, ticketId, userId, span);
          }
        }

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errMsg });
        this.logger.error(`Heartbeat processing failed: ${errMsg}`);
      } finally {
        stopTimer(); // Prometheus: Record processing duration
        span.end();
      }
    });
  }

  // ===========================================================================
  // AUTO-TRANSITION LOGIC (extracted for span clarity)
  // ===========================================================================

  private async attemptAutoTransition(
    projectId: string,
    ticketId: string,
    userId: string,
    parentSpan: ReturnType<typeof this.tracer.startSpan>,
  ): Promise<void> {
    const transitionSpan = this.tracer.startSpan(
      'telemetry.autoTransition',
      { attributes: { 'telemetry.ticket_id': ticketId } },
      trace.setSpan(context.active(), parentSpan),
    );

    try {
      const issue = await this.issuesService.findOne(projectId, ticketId, userId);

      if (issue.status !== 'In Progress') {
        this.logger.log(`Auto-transitioning ticket ${ticketId} to In Progress`);
        await this.issuesService.updateStatus(
          projectId,
          ticketId,
          'In Progress',
          userId,
        );
        this.telemetryMetrics.recordAutoTransition('success');
        transitionSpan.addEvent('transition.completed', {
          'telemetry.from_status': issue.status,
        });
      } else {
        this.telemetryMetrics.recordAutoTransition('skipped');
        transitionSpan.addEvent('transition.skipped', {
          'telemetry.reason': 'already_in_progress',
        });
      }

      transitionSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.telemetryMetrics.recordAutoTransition('error');
      transitionSpan.setStatus({ code: SpanStatusCode.ERROR, message: errMsg });
      this.logger.error(`Failed to auto-transition ticket ${ticketId}: ${errMsg}`);
    } finally {
      transitionSpan.end();
    }
  }
}
