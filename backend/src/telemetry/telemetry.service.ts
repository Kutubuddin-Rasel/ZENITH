import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { context, trace, SpanStatusCode, propagation } from '@opentelemetry/api';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { TelemetryMetricsService } from './telemetry-metrics.service';

// =============================================================================
// OTEL CONTEXT CARRIER TYPE
// =============================================================================

/**
 * Serialized OTel trace context injected into BullMQ job data.
 * This is how we propagate traces across the async Redis queue boundary.
 *
 * The carrier is a plain Record<string, string> that the W3C TraceContext
 * propagator writes `traceparent` and `tracestate` into.
 */
export interface TraceCarrier {
  [key: string]: string;
}

/**
 * BullMQ job payload with embedded trace context.
 * Extends HeartbeatDto with the serialized OTel context.
 */
export interface HeartbeatJobPayload {
  ticketId: string;
  projectId: string;
  userId: string;
  _traceCarrier?: TraceCarrier;
}

// =============================================================================
// TELEMETRY SERVICE
// =============================================================================

/**
 * Telemetry ingestion service.
 *
 * Accepts pre-validated HeartbeatDto payloads and dispatches them
 * to the BullMQ 'telemetry' queue for async processing.
 *
 * OBSERVABILITY:
 * 1. Prometheus: Increments heartbeat counter on every ingest
 * 2. OpenTelemetry: Creates a span for queue dispatch, injects trace
 *    context into the job payload for cross-boundary propagation
 *
 * ZERO `any` TOLERANCE.
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly tracer = trace.getTracer('zenith-telemetry');

  constructor(
    @InjectQueue('telemetry') private telemetryQueue: Queue,
    private readonly telemetryMetrics: TelemetryMetricsService,
  ) {}

  async ingestHeartbeat(data: HeartbeatDto): Promise<{ status: string }> {
    const span = this.tracer.startSpan('telemetry.ingestHeartbeat', undefined, context.active());

    try {
      // =====================================================================
      // OTEL: Serialize current trace context into the job payload
      // This allows the BullMQ worker to create a child span
      // =====================================================================
      const carrier: TraceCarrier = {};
      propagation.inject(context.active(), carrier);

      const jobPayload: HeartbeatJobPayload = {
        ticketId: data.ticketId,
        projectId: data.projectId,
        userId: data.userId,
        _traceCarrier: Object.keys(carrier).length > 0 ? carrier : undefined,
      };

      await this.telemetryQueue.add('heartbeat', jobPayload, {
        removeOnComplete: true,
        attempts: 3,
      });

      // Prometheus: Record successful queue dispatch
      this.telemetryMetrics.recordHeartbeatQueued();

      span.setStatus({ code: SpanStatusCode.OK });
      return { status: 'queued' };
    } catch (error) {
      // Prometheus: Record failed queue dispatch
      this.telemetryMetrics.recordHeartbeatFailed();

      const errMsg = error instanceof Error ? error.message : String(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errMsg });
      this.logger.error(`Heartbeat ingestion failed: ${errMsg}`);
      throw error;
    } finally {
      span.end();
    }
  }
}
