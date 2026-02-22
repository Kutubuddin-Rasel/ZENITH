/**
 * Vector Sync Listener — EventEmitter2 → BullMQ Bridge
 *
 * Listens for issue lifecycle events and enqueues vector synchronization
 * jobs. Follows the exact pattern of existing TriageListener.
 *
 * TWEAK 1 — BULLMQ DEBOUNCE:
 * Jobs use `jobId: vector-sync:${issueId}` + `delay: 3000`.
 * If a user saves 3 times in 2 seconds, BullMQ deduplicates by jobId
 * before the 3-second delay expires → only 1 OpenAI API call.
 *
 * EVENTS HANDLED:
 *   issue.text-changed → action: 'update' (emitted by IssuesService.update diff check)
 *   issue.archived     → action: 'archive' (nullify embedding)
 *   issue.deleted      → action: 'delete' (no-op — row is hard-deleted)
 *   issue.unarchived   → action: 'unarchive' (re-generate embedding)
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  VECTOR_SYNC_QUEUE,
  VectorSyncAction,
  VectorSyncJobData,
} from '../interfaces/vector-sync-job.interface';

/** Event payload shape emitted by IssuesService. */
interface IssueLifecycleEvent {
  issueId: string;
  projectId: string;
  actorId?: string;
}

@Injectable()
export class VectorSyncListener {
  private readonly logger = new Logger(VectorSyncListener.name);

  constructor(
    @InjectQueue(VECTOR_SYNC_QUEUE)
    private readonly vectorSyncQueue: Queue<VectorSyncJobData>,
  ) {}

  @OnEvent('issue.text-changed')
  async handleTextChanged(payload: IssueLifecycleEvent): Promise<void> {
    await this.enqueue(payload.issueId, 'update');
  }

  @OnEvent('issue.archived')
  async handleArchived(payload: IssueLifecycleEvent): Promise<void> {
    await this.enqueue(payload.issueId, 'archive');
  }

  @OnEvent('issue.deleted')
  async handleDeleted(payload: IssueLifecycleEvent): Promise<void> {
    await this.enqueue(payload.issueId, 'delete');
  }

  @OnEvent('issue.unarchived')
  async handleUnarchived(payload: IssueLifecycleEvent): Promise<void> {
    await this.enqueue(payload.issueId, 'unarchive');
  }

  /**
   * Enqueue a vector-sync job with debounce.
   *
   * jobId ensures BullMQ deduplicates rapid consecutive events
   * for the same issue. delay: 3000 creates a 3-second debounce
   * window so the worker processes only after edits settle.
   */
  private async enqueue(
    issueId: string,
    action: VectorSyncAction,
  ): Promise<void> {
    try {
      await this.vectorSyncQueue.add(
        'sync-embedding',
        { issueId, action },
        {
          jobId: `vector-sync:${issueId}`,
          delay: 3000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      );
      this.logger.log(`Enqueued vector-sync [${action}] for issue ${issueId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to enqueue vector-sync for ${issueId}: ${message}`,
      );
    }
  }
}
