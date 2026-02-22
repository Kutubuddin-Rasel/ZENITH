/**
 * Reranker Interface — Provider Abstraction
 *
 * Abstract class for cross-encoder reranking services.
 * Concrete implementations: CohereRerankerService, HuggingFaceRerankerService.
 *
 * WHY ABSTRACT CLASS (not TypeScript interface)?
 *   TypeScript interfaces are erased at runtime — NestJS DI cannot inject them.
 *   Abstract classes preserve the token at runtime for @Inject(RerankerService).
 *   Swapping providers is a one-line change: useClass: HuggingFaceRerankerService.
 */

/** Document submitted to the reranker for scoring. */
export interface RerankDocument {
  /** Issue UUID — used to correlate back to HybridSearchResult. */
  id: string;
  /** Concatenated Title + Description for semantic scoring. */
  text: string;
}

/** Reranker output: original document ID + cross-encoder relevance score. */
export interface RerankResult {
  /** Same Issue UUID from input. */
  id: string;
  /** Cross-encoder relevance score (0-1, higher = more relevant). */
  relevanceScore: number;
  /** Original index in the input array. */
  index: number;
}

/**
 * Abstract reranker service.
 * Inject this token — NestJS resolves to the concrete useClass binding.
 */
export abstract class RerankerService {
  /**
   * Rerank documents by relevance to a query.
   *
   * @param query     - The search query (MUST be the reformulated query for coreference)
   * @param documents - Array of documents to rerank, each with id + text
   * @param topN      - Number of top results to return
   * @returns Reranked documents with cross-encoder relevance scores, sorted desc
   */
  abstract rerank(
    query: string,
    documents: RerankDocument[],
    topN: number,
  ): Promise<RerankResult[]>;
}
