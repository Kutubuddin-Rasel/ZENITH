/**
 * Vector Sync Job Interface
 *
 * Queue contract for the real-time vector synchronization pipeline.
 * Jobs are enqueued by VectorSyncListener (EventEmitter2 bridge)
 * and processed by VectorSyncWorker (@Processor).
 *
 * CRITICAL: Pass only issueId, NOT the full text.
 * The worker fetches the latest entity state from the database
 * to defend against race conditions from rapid consecutive edits.
 */

/** Queue name constant — used by @InjectQueue and @Processor. */
export const VECTOR_SYNC_QUEUE = 'vector-sync';

/**
 * Lifecycle actions that trigger vector synchronization.
 *   update    — title/description text changed
 *   archive   — soft-deleted, nullify embedding
 *   delete    — hard-deleted, row already gone (no-op)
 *   unarchive — restored, re-generate embedding
 */
export type VectorSyncAction = 'update' | 'archive' | 'delete' | 'unarchive';

/**
 * Job payload for the vector-sync queue.
 */
export interface VectorSyncJobData {
  issueId: string;
  action: VectorSyncAction;
}
