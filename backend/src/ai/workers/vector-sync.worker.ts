/**
 * Vector Sync Worker — BullMQ Processor
 *
 * Processes vector synchronization jobs enqueued by VectorSyncListener.
 * Handles 4 actions: update, archive, delete, unarchive.
 *
 * ARCHITECTURE:
 *   1. Fresh-fetch: Always reads the latest entity from DB (race defense).
 *   2. Strict retry (Tweak 2): Embedding errors propagate to BullMQ for
 *      automatic exponential backoff retry. No fail-open.
 *   3. Delegate searchVector (Tweak 3): Only writes embedding + embedding_vector.
 *      Postgres trigger handles searchVector (tsvector) updates.
 *
 * DEEP THINKING — RACE CONDITIONS:
 *   If 3 rapid edits enqueue 3 jobs, BullMQ debounce (jobId + delay)
 *   collapses them to 1. Even if multiple execute, fresh-fetch ensures
 *   all produce the same embedding from the latest DB state.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Job } from 'bullmq';
import { EmbeddingsService } from '../services/embeddings.service';
import {
  VECTOR_SYNC_QUEUE,
  VectorSyncJobData,
} from '../interfaces/vector-sync-job.interface';

/**
 * Row shape from the fresh-fetch query.
 * Only selects the fields needed for embedding generation + guards.
 */
interface IssueFetchRow {
  id: string;
  title: string;
  description: string | null;
  isArchived: boolean;
}

@Processor(VECTOR_SYNC_QUEUE)
export class VectorSyncWorker extends WorkerHost {
  private readonly logger = new Logger(VectorSyncWorker.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Main job handler — dispatches to action-specific methods.
   * Errors thrown here are caught by BullMQ and trigger automatic
   * retry with exponential backoff (2s → 4s → 8s).
   */
  async process(job: Job<VectorSyncJobData>): Promise<void> {
    const { issueId, action } = job.data;
    this.logger.log(`Processing vector-sync [${action}] for issue ${issueId}`);

    switch (action) {
      case 'update':
      case 'unarchive':
        await this.handleUpdate(issueId);
        break;
      case 'archive':
        await this.handleArchive(issueId);
        break;
      case 'delete':
        this.handleDelete(issueId);
        break;
      default:
        this.logger.warn(`Unknown vector-sync action: ${action as string}`);
    }
  }

  /**
   * Handle 'update' / 'unarchive': Re-generate and store the embedding.
   *
   * STRICT RETRY (Tweak 2):
   *   If EmbeddingsService throws (429, 5xx), the error propagates
   *   to BullMQ. The job is marked Failed and retried automatically.
   *   We do NOT catch and swallow embedding errors.
   */
  private async handleUpdate(issueId: string): Promise<void> {
    // Step 1: Fresh-fetch the latest entity state
    const rows: IssueFetchRow[] = await this.dataSource.query(
      `SELECT id, title, description, "isArchived" FROM issues WHERE id = $1`,
      [issueId],
    );

    if (rows.length === 0) {
      this.logger.warn(
        `Issue ${issueId} not found — may have been deleted. Skipping.`,
      );
      return;
    }

    const issue = rows[0];

    // Step 2: Guard against archived issues (race condition)
    if (issue.isArchived) {
      this.logger.log(
        `Issue ${issueId} is archived — skipping embedding generation.`,
      );
      return;
    }

    // Step 3: Combine text for embedding
    const textToEmbed = `${issue.title}\n\n${issue.description || ''}`.trim();

    // Step 4: Generate embedding (STRICT — errors propagate to BullMQ)
    const embedding = await this.embeddingsService.create(textToEmbed);

    if (!embedding || embedding.length === 0) {
      // Non-error empty response — throw to trigger retry
      throw new Error(
        `Empty embedding returned for issue ${issueId}. Retrying.`,
      );
    }

    // Step 5: Write embedding to DB (Tweak 3 — NO searchVector)
    // Format as pgvector string literal: '[0.1,0.2,...]'
    const embeddingStr = `[${embedding.join(',')}]`;

    await this.dataSource.query(
      `
      UPDATE issues
      SET embedding = $1,
          embedding_vector = $2::vector(1536)
      WHERE id = $3
      `,
      [embedding, embeddingStr, issueId],
    );

    this.logger.log(
      `Embedding updated for issue ${issueId} (${embedding.length} dims)`,
    );
  }

  /**
   * Handle 'archive': Nullify embedding columns.
   * Defense-in-depth — hybrid search already filters isArchived=false,
   * but nullifying prevents stale vectors from leaking through future queries.
   */
  private async handleArchive(issueId: string): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE issues
      SET embedding = NULL,
          embedding_vector = NULL
      WHERE id = $1
      `,
      [issueId],
    );

    this.logger.log(`Embedding nullified for archived issue ${issueId}`);
  }

  /**
   * Handle 'delete': No-op.
   * The row was hard-deleted by IssuesService.remove() (issueRepo.remove()).
   * Nothing to update — the embedding is gone with the row.
   */
  private handleDelete(issueId: string): void {
    this.logger.log(
      `Delete processed for issue ${issueId} — no-op (row already gone)`,
    );
  }
}
