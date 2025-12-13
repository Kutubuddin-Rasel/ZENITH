import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TelemetryService {
  constructor(@InjectQueue('telemetry') private telemetryQueue: Queue) {}

  async ingestHeartbeat(data: any) {
    // Add to BullMQ for async processing
    // Using 'removeOnComplete' to keep Redis clean
    await this.telemetryQueue.add('heartbeat', data, {
      removeOnComplete: true,
      attempts: 3,
    });
    return { status: 'queued' };
  }
}
