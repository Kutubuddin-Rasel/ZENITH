import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ClickHouseClient } from './clickhouse.client';
import { AuditLogEvent } from './interfaces/audit-log-event.interface';

@Processor('audit-queue')
export class AuditLogsWorker extends WorkerHost {
  private buffer: any[] = [];
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private timer: NodeJS.Timeout;

  constructor(private readonly clickHouse: ClickHouseClient) {
    super();
    // Flush periodically
    this.timer = setInterval(() => void this.flush(), this.FLUSH_INTERVAL);
  }

  async process(job: Job<AuditLogEvent>): Promise<any> {
    const event = job.data;

    // Transform event for ClickHouse if needed
    // Map(String, Tuple) is complex to insert directly via JSON,
    // so we simplified table schema to Map(String, String) where value is JSON string of [old, new]
    const { changes, metadata } = event;
    const transformed = {
      id: event.id,
      action: event.action,
      entityId: event.entityId,
      entityType: event.entityType,
      userId: event.userId,
      projectId: event.projectId,
      timestamp: event.timestamp || new Date(),
      changes: changes ? this.transformChanges(changes) : {},
      metadata: metadata ? JSON.stringify(metadata) : '{}',
    };

    this.buffer.push(transformed);

    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.slice();
    this.buffer = [];

    try {
      await this.clickHouse.insertBatch(batch);
      console.log(
        `[AuditLogsWorker] Flushed ${batch.length} events to ClickHouse`,
      );
    } catch (error) {
      console.error('[AuditLogsWorker] Failed to flush batch', error);
      // Re-queue logic or dead letter would go here
      // For now, simple error log is MVP
    }
  }

  private transformChanges(
    changes: Record<string, [string, string]>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(changes)) {
      result[key] = JSON.stringify(value);
    }
    return result;
  }
}
