/**
 * AIFeedback Entity — User Feedback on RAG Answers
 *
 * Stores thumbs-up/thumbs-down feedback for contextual search responses.
 * Enables offline analytics to measure RAG accuracy and iterate on prompts.
 *
 * IDEMPOTENCY (per db-use-migrations):
 *   UNIQUE(conversationId, messageId) ensures exactly one rating per message.
 *   The service uses INSERT ... ON CONFLICT DO UPDATE to handle re-submissions.
 *   Clicking 👎 500 times updates the same row — zero data bloat.
 *
 * TENANT ISOLATION (per security-use-guards):
 *   tenantId comes from JWT, never from user input. Analytics queries
 *   always filter by tenantId to prevent cross-tenant data access.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ai_feedback')
@Index(['tenantId', 'createdAt'])
@Index(['conversationId', 'messageId'], { unique: true })
export class AIFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Organization ID from JWT — tenant isolation for analytics. */
  @Column('uuid')
  @Index()
  tenantId: string;

  /** User who submitted the feedback. */
  @Column('uuid')
  @Index()
  userId: string;

  /** Conversation session ID (from session-init SSE event). */
  @Column('uuid')
  conversationId: string;

  /**
   * Frontend-generated UUID identifying a specific prompt/response pair.
   * Part of the UNIQUE constraint — prevents duplicate ratings per message.
   */
  @Column('uuid')
  messageId: string;

  /** The user's original question. */
  @Column('text')
  queryText: string;

  /** The full LLM response. */
  @Column('text')
  responseText: string;

  /**
   * Issue UUIDs retrieved by the RAG engine for this response.
   * Stored as comma-separated text (simple-array) — efficient for ≤20 UUIDs.
   */
  @Column('simple-array')
  retrievedIssueIds: string[];

  /** true = 👍 helpful, false = 👎 not helpful. */
  @Column('boolean')
  isHelpful: boolean;

  /** Optional freeform explanation from the user. */
  @Column('text', { nullable: true })
  comments: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
