import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditLogEvent } from './interfaces/audit-log-event.interface';

@Injectable()
export class AuditLogsService {
  constructor(@InjectQueue('audit-queue') private auditQueue: Queue) {}

  async log(event: AuditLogEvent) {
    // Fire and forget
    await this.auditQueue.add('audit-event', event, {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }
}
