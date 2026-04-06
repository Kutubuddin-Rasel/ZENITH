import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HeartbeatDto } from './dto/heartbeat.dto';

// =============================================================================
// TELEMETRY SERVICE
// =============================================================================

/**
 * Telemetry ingestion service.
 *
 * Accepts pre-validated HeartbeatDto payloads and dispatches them
 * to the BullMQ 'telemetry' queue for async processing.
 *
 * The DTO has already been validated by the controller's ValidationPipe,
 * so no extra fields can reach the queue (queue poisoning defense).
 */
@Injectable()
export class TelemetryService {
  constructor(@InjectQueue('telemetry') private telemetryQueue: Queue) {}

  async ingestHeartbeat(data: HeartbeatDto): Promise<{ status: string }> {
    await this.telemetryQueue.add('heartbeat', data, {
      removeOnComplete: true,
      attempts: 3,
    });
    return { status: 'queued' };
  }
}
