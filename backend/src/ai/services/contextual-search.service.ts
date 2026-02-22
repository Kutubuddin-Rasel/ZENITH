/**
 * Contextual Search Service (SSE Streaming + Multi-Turn Memory)
 *
 * Retrieves relevant issues via hybrid search and streams an LLM-synthesized
 * answer back to the client using RxJS Observable<MessageEvent>.
 *
 * GAP 2: MULTI-TURN CONVERSATION MEMORY
 * Added 6-step pipeline:
 *   A. Conversation ID validation/generation
 *   B. Redis history retrieval (sliding window: last 10 messages)
 *   C. Query reformulation (coreference resolution via gpt-4o-mini)
 *   D. Hybrid search using REFORMULATED query
 *   E. Prompt assembly (rules + DB context + history)
 *   F. Stream LLM response + ordered Redis save
 *
 * PRODUCTION TWEAKS:
 *   1. Sequential RPUSH (await user THEN assistant) — no race conditions
 *   2. Plaintext history format (User: .../Assistant: ...) — no raw JSON
 *   3. AbortError structurally bypasses Redis save — explicit teardown safety
 *
 * DEEP THINKING — CLIENT DISCONNECT:
 *   When the subscriber unsubscribes (browser tab close), the Observable's
 *   teardown function calls `stream.controller.abort()`, sending an
 *   AbortSignal to the underlying HTTP request. The for-await loop throws
 *   AbortError, the catch block skips Redis save and completes silently.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingsService } from './embeddings.service';
import {
  SemanticSearchService,
  HybridSearchResult,
} from './semantic-search.service';
import { OpenAiService } from './openai.service';
import { CacheService } from '../../cache/cache.service';
import {
  RerankerService,
  RerankDocument,
} from '../interfaces/reranker.interface';
import { ContextualSearchDto } from '../dto/contextual-search.dto';

// ─── Configuration Constants ───────────────────────────────────

/** Maximum characters per issue description in the LLM context. */
const MAX_DESCRIPTION_LENGTH = 500;

/** Minimum similarity threshold for hybrid search (ada-002 noise floor). */
const MIN_SIMILARITY = 0.78;

/**
 * Wider retrieval pool for cross-encoder reranking.
 * Fetch 20 from DB, rerank to topN (user's maxResults, default 5).
 */
const RERANK_POOL_SIZE = 20;

/** Redis key prefix for contextual search conversations. */
const CONV_KEY_PREFIX = 'cs:conv';

/** Redis namespace for contextual search conversations. */
const CONV_NAMESPACE = 'contextual-search';

/** TTL for conversation history in Redis (30 minutes). */
const CONV_TTL_SECONDS = 1800;

/** Maximum number of messages to retrieve from Redis (sliding window). */
const MAX_HISTORY_MESSAGES = 10;

/** Maximum total characters of conversation history in prompts. */
const MAX_HISTORY_CHARS = 4000;

// ─── Types ─────────────────────────────────────────────────────

/** A single message in the conversation history, stored in Redis. */
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** SSE event payload types. NestJS @Sse() auto-stringifies — DO NOT JSON.stringify. */
interface SessionInitPayload {
  type: 'session-init';
  conversationId: string;
}

interface SourcesPayload {
  type: 'sources';
  issues: Array<{
    issueId: string;
    issueKey: string;
    title: string;
    similarity: number;
  }>;
}

interface ChunkPayload {
  type: 'chunk';
  content: string;
}

interface DonePayload {
  type: 'done';
}

interface NoResultsPayload {
  type: 'no-results';
  message: string;
}

interface ErrorPayload {
  type: 'error';
  message: string;
}

type SsePayload =
  | SessionInitPayload
  | SourcesPayload
  | ChunkPayload
  | DonePayload
  | NoResultsPayload
  | ErrorPayload;

// ─── Service ───────────────────────────────────────────────────

@Injectable()
export class ContextualSearchService {
  private readonly logger = new Logger(ContextualSearchService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly semanticSearch: SemanticSearchService,
    private readonly openAiService: OpenAiService,
    private readonly cacheService: CacheService,
    private readonly rerankerService: RerankerService,
  ) {}

  /**
   * Execute contextual search and return an SSE Observable.
   *
   * @param dto - Validated input DTO (query, optional projectId/maxResults/conversationId)
   * @param tenantId - Organization ID from JWT (never from user input)
   * @returns Observable<MessageEvent> for @Sse() decorator
   */
  search(dto: ContextualSearchDto, tenantId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>(
      (subscriber: Subscriber<MessageEvent>) => {
        let abortController: AbortController | null = null;

        this.executeSearchPipeline(dto, tenantId, subscriber, (controller) => {
          abortController = controller;
        }).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Contextual search pipeline failed: ${message}`);
          this.emitEvent(subscriber, {
            type: 'error',
            message: 'Search failed unexpectedly. Please try again.',
          });
          subscriber.complete();
        });

        // TEARDOWN: Called when subscriber unsubscribes (client disconnects)
        return () => {
          if (abortController) {
            this.logger.log('Client disconnected — aborting LLM stream');
            abortController.abort();
          }
        };
      },
    );
  }

  /**
   * The core 6-step pipeline:
   *   A. Conversation ID → B. Redis History → C. Query Reformulation →
   *   D. Hybrid Search → E. Prompt Assembly → F. Stream + Redis Save
   */
  private async executeSearchPipeline(
    dto: ContextualSearchDto,
    tenantId: string,
    subscriber: Subscriber<MessageEvent>,
    registerAbort: (controller: AbortController) => void,
  ): Promise<void> {
    const { query, projectId, maxResults = 5 } = dto;

    // ─── STEP A: Conversation ID Validation / Generation ───
    let conversationId = dto.conversationId;
    let history: ConversationMessage[] = [];

    if (conversationId) {
      // Try to retrieve existing history
      history = await this.getHistory(conversationId);

      if (history.length === 0) {
        // Expired TTL or new session — generate new ID
        this.logger.log(
          `Conversation ${conversationId} expired or empty — starting new session`,
        );
        conversationId = uuidv4();
        this.emitEvent(subscriber, {
          type: 'session-init',
          conversationId,
        });
      }
      // If history exists, keep the same conversationId (no session-init)
    } else {
      // First turn — generate UUID and emit session-init
      conversationId = uuidv4();
      this.emitEvent(subscriber, {
        type: 'session-init',
        conversationId,
      });
    }

    // ─── STEP B: History Retrieval (already done in Step A) ─
    // Apply character truncation safety net
    history = this.truncateHistory(history, MAX_HISTORY_CHARS);

    // ─── STEP C: Query Reformulation (Coreference Resolution) ─
    // Only runs when we have conversation history (skip on first turn)
    let searchQuery = query;

    if (history.length > 0) {
      const historyText = this.formatHistoryAsPlaintext(history);
      searchQuery = await this.reformulateQuery(query, historyText);
      this.logger.log(`Reformulated query: "${query}" → "${searchQuery}"`);
    }

    // ─── STEP D: Embed + Hybrid Search (using REFORMULATED query) ─
    // Gap 3: Fetch wider pool (20) for cross-encoder reranking
    const embedding = await this.embeddingsService.create(searchQuery);

    if (!embedding || embedding.length === 0) {
      this.logger.warn('Embedding generation failed — returning error');
      this.emitEvent(subscriber, {
        type: 'error',
        message:
          'AI search is temporarily unavailable. Please try again later.',
      });
      subscriber.complete();
      return;
    }

    const candidates: HybridSearchResult[] =
      await this.semanticSearch.hybridSearchIssues(
        tenantId,
        searchQuery,
        embedding,
        {
          projectId,
          limit: RERANK_POOL_SIZE,
          minSimilarity: MIN_SIMILARITY,
        },
      );

    // Anti-Hallucination Short-Circuit
    if (candidates.length === 0) {
      this.emitEvent(subscriber, {
        type: 'no-results',
        message:
          'No matching issues found for your query. Try rephrasing or broadening your search.',
      });
      subscriber.complete();
      return;
    }

    // ─── STEP D.2: Cross-Encoder Reranking (20 → maxResults) ──
    const results = await this.rerankWithFallback(
      searchQuery,
      candidates,
      maxResults,
    );

    // ─── Emit Sources Event ────────────────────────────────
    this.emitEvent(subscriber, {
      type: 'sources',
      issues: results.map((r) => ({
        issueId: r.id,
        issueKey: `${r.projectKey}-${r.issueNumber}`,
        title: r.title,
        similarity: Math.round(r.hybridScore * 1000) / 1000,
      })),
    });

    // ─── STEP E: Prompt Assembly ───────────────────────────
    const contextBlock = this.buildContextBlock(results);
    const historyBlock =
      history.length > 0 ? this.formatHistoryAsPlaintext(history) : '';
    const systemPrompt = this.buildSystemPrompt(contextBlock, historyBlock);

    // ─── STEP F: Stream LLM + Ordered Redis Save ──────────
    try {
      const { stream } = await this.openAiService.streamChat(
        systemPrompt,
        query, // ORIGINAL query — preserves conversational tone
      );

      registerAbort(stream.controller);

      // Accumulate chunks into buffer for Redis save
      const chunks: string[] = [];

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          chunks.push(content);
          this.emitEvent(subscriber, { type: 'chunk', content });
        }
      }

      // ↓ Only reached if stream completes naturally (no AbortError) ↓

      // Tweak 1: Sequential await — guarantees chronological order in Redis
      const fullResponse = chunks.join('');
      await this.appendToHistory(conversationId, 'user', query);
      await this.appendToHistory(conversationId, 'assistant', fullResponse);

      this.emitEvent(subscriber, { type: 'done' });
      subscriber.complete();
    } catch (error: unknown) {
      // Tweak 3: AbortError — explicit bypass, NO Redis save
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.log('Client disconnected — skipping Redis save');
        subscriber.complete();
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown LLM error';
      this.logger.error(`LLM streaming error: ${message}`);
      this.emitEvent(subscriber, {
        type: 'error',
        message: 'AI response was interrupted. Please try your search again.',
      });
      subscriber.complete();
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Cross-encoder reranking with graceful fallback.
   *
   * If the reranker API fails (timeout, 5xx, or any error), falls back to
   * the original hybrid search ordering (candidates.slice(0, topN)).
   *
   * Tweak 2: Overwrites hybridScore with the reranker's relevanceScore so
   * the Sources SSE event and LLM prompt reflect the cross-encoder's precision.
   */
  private async rerankWithFallback(
    query: string,
    candidates: HybridSearchResult[],
    topN: number,
  ): Promise<HybridSearchResult[]> {
    // Guard: if candidates ≤ topN, reranking is pointless
    if (candidates.length <= topN) return candidates;

    try {
      const documents: RerankDocument[] = candidates.map((c) => ({
        id: c.id,
        text: `${c.title}\n${c.description || ''}`.trim(),
      }));

      const reranked = await this.rerankerService.rerank(
        query,
        documents,
        topN,
      );

      // Map reranked IDs back AND overwrite hybridScore with reranker's score
      return reranked.map((r) => {
        const original = candidates.find((c) => c.id === r.id);
        if (!original) {
          // Defensive: should never happen since reranker returns subset
          this.logger.warn(`Reranker returned unknown ID: ${r.id}`);
          return candidates[r.index];
        }
        return {
          ...original,
          hybridScore: r.relevanceScore,
        };
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Reranker failed (${message}) — using hybrid score fallback`,
      );
      return candidates.slice(0, topN);
    }
  }

  /**
   * Retrieve conversation history from Redis.
   * Graceful degradation: returns [] if Redis is down or key expired.
   */
  private async getHistory(
    conversationId: string,
  ): Promise<ConversationMessage[]> {
    try {
      return await this.cacheService.lrange<ConversationMessage>(
        `${CONV_KEY_PREFIX}:${conversationId}`,
        -MAX_HISTORY_MESSAGES,
        -1,
        { namespace: CONV_NAMESPACE },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis history retrieval failed for ${conversationId}: ${message}`,
      );
      return [];
    }
  }

  /**
   * Append a message to conversation history in Redis.
   * Uses RPUSH for atomic append. TTL refreshed on each write.
   */
  private async appendToHistory(
    conversationId: string,
    role: ConversationMessage['role'],
    content: string,
  ): Promise<void> {
    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.cacheService.rpush(
        `${CONV_KEY_PREFIX}:${conversationId}`,
        message,
        { ttl: CONV_TTL_SECONDS, namespace: CONV_NAMESPACE },
      );
    } catch (error: unknown) {
      const errMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Redis history append failed for ${conversationId}: ${errMessage}`,
      );
    }
  }

  /**
   * Format conversation history as plaintext transcript.
   * Tweak 2: Produces "User: ...\nAssistant: ..." format, never raw JSON.
   */
  private formatHistoryAsPlaintext(messages: ConversationMessage[]): string {
    return messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
  }

  /**
   * Truncate history to stay within character budget.
   * Drops OLDEST messages first, but keeps minimum 2 (last user/assistant pair).
   */
  private truncateHistory(
    messages: ConversationMessage[],
    maxChars: number,
  ): ConversationMessage[] {
    let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const result = [...messages];

    while (totalChars > maxChars && result.length > 2) {
      const dropped = result.shift();
      if (dropped) {
        totalChars -= dropped.content.length;
      }
    }

    return result;
  }

  /**
   * Reformulate a user query using conversation history.
   * Resolves pronouns and coreferences via a fast gpt-4o-mini call.
   * Falls back to the original query if reformulation fails.
   */
  private async reformulateQuery(
    originalQuery: string,
    historyText: string,
  ): Promise<string> {
    try {
      const reformulated = await this.openAiService.generateText(
        `Given this conversation history:\n${historyText}\n\n` +
          `The user's latest message is: "${originalQuery}"\n\n` +
          `Rewrite the latest message as a STANDALONE search query that resolves ` +
          `all pronouns and references using the conversation history. ` +
          `Return ONLY the rewritten query, nothing else. ` +
          `If the message is already standalone, return it unchanged.`,
        'gpt-4o-mini',
      );

      // Guard: if LLM returns empty or garbage, fall back to original
      return reformulated.trim() || originalQuery;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Query reformulation failed: ${message}`);
      return originalQuery; // Graceful fallback — search with original query
    }
  }

  /**
   * Build truncated context block from hybrid search results.
   */
  private buildContextBlock(results: HybridSearchResult[]): string {
    return results
      .map((r) => {
        const key = `${r.projectKey}-${r.issueNumber}`;
        const desc = r.description
          ? r.description.substring(0, MAX_DESCRIPTION_LENGTH) +
            (r.description.length > MAX_DESCRIPTION_LENGTH ? '...' : '')
          : 'No description';
        return `[${key}] ${r.title} (Status: ${r.status})\n${desc}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Build the system prompt with DB context and conversation history.
   * Three sections in priority order: Rules → DB Context → History.
   */
  private buildSystemPrompt(
    contextBlock: string,
    historyBlock: string,
  ): string {
    let prompt = `You are Zenith AI, an intelligent project management assistant.

## Rules
1. Answer the user's question using ONLY the issue context provided below.
2. You MUST cite specific issue keys (e.g., ZEN-42) when referencing facts.
3. If the answer cannot be determined from the provided context, say: "I don't have enough context to answer this question. The retrieved issues don't cover this topic."
4. Do NOT invent, guess, or hallucinate any issue keys, facts, or details.
5. Keep your answer concise and well-structured. Use bullet points for clarity.
6. If multiple issues are relevant, synthesize the information into a coherent answer.

## Issue Context
${contextBlock}`;

    if (historyBlock) {
      prompt += `\n\n## Conversation History\nThe following is the conversation so far. Use it to understand references and context from previous turns.\n${historyBlock}`;
    }

    return prompt;
  }

  /**
   * Emit an SSE event via the subscriber.
   * NestJS @Sse() auto-stringifies the `data` property.
   * DO NOT use JSON.stringify() — it causes double-encoding.
   */
  private emitEvent(
    subscriber: Subscriber<MessageEvent>,
    payload: SsePayload,
  ): void {
    subscriber.next({ data: payload });
  }
}
