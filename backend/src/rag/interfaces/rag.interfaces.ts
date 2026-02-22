/**
 * RAG Module Interfaces
 *
 * Strict typing for conversation memory and document chunking.
 * ZERO `any` types — all structures are fully typed.
 */

// ============================================================
// CONVERSATION MEMORY
// ============================================================

/**
 * Role in a RAG conversation turn.
 */
export type RagMessageRole = 'user' | 'assistant' | 'system';

/**
 * Single message in a RAG conversation.
 *
 * NOTE: `timestamp` is ISO 8601 string (not Date) because
 * Redis serialization via JSON.stringify converts Date to string.
 * Keeping it as string avoids silent type coercion bugs.
 */
export interface RagConversationMessage {
  role: RagMessageRole;
  content: string;
  timestamp: string; // ISO 8601
}

// ============================================================
// DOCUMENT CHUNKING
// ============================================================

/**
 * Metadata attached to each document chunk for traceability.
 * Stored in the `metadata` JSONB column of `DocumentSegment`.
 */
export interface DocumentChunkMetadata {
  /** Source project for tenant isolation */
  projectId: string;

  /** Parent document ID for back-reference */
  documentId: string;

  /** Zero-based index of this chunk within the document */
  chunkIndex: number;

  /** Total number of chunks in the document */
  totalChunks: number;

  /** Character length of the original raw text */
  sourceLength: number;

  /** Original file path for debugging */
  sourcePath: string;
}

/**
 * A single document chunk with its embedding and metadata.
 * Represents the data that will be persisted to `DocumentSegment`.
 */
export interface DocumentChunk {
  /** The chunked text content */
  content: string;

  /** Vector embedding (e.g., 1536 dims for OpenAI ada-002) */
  embedding: number[];

  /** Structured metadata for traceability */
  metadata: DocumentChunkMetadata;
}
