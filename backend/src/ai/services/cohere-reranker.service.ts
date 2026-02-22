/**
 * Cohere Reranker Service — Cross-Encoder Reranking via Cohere API
 *
 * Concrete implementation of RerankerService using Cohere's rerank-v3.5 model.
 *
 * PRODUCTION TWEAKS:
 *   1. Native Axios timeout (2000ms) — no dangling timers from Promise.race.
 *   2. onModuleInit() — fail-fast if COHERE_API_KEY is missing at startup.
 *   3. Maps Cohere response back to RerankResult with original document IDs.
 *
 * PROVIDER SWAP: To switch to HuggingFace/BGE, create a new class extending
 * RerankerService and change useClass in ai.module.ts. ContextualSearchService
 * never knows which provider is used.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  RerankerService,
  RerankDocument,
  RerankResult,
} from '../interfaces/reranker.interface';

/** Shape of a single result from the Cohere Rerank v2 API response. */
interface CohereRerankResponseItem {
  index: number;
  relevance_score: number;
}

/** Shape of the full Cohere Rerank v2 API response body. */
interface CohereRerankResponse {
  id: string;
  results: CohereRerankResponseItem[];
  meta: { api_version: { version: string } };
}

/** Cohere Rerank API endpoint. */
const COHERE_RERANK_URL = 'https://api.cohere.com/v2/rerank';

/** Cohere reranking model. */
const COHERE_MODEL = 'rerank-v3.5';

/** Request timeout in milliseconds (Tweak 1: native Axios timeout). */
const REQUEST_TIMEOUT_MS = 2000;

@Injectable()
export class CohereRerankerService
  extends RerankerService
  implements OnModuleInit
{
  private readonly logger = new Logger(CohereRerankerService.name);
  private apiKey: string = '';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super();
  }

  /**
   * Tweak 3: Fail-fast on missing API key at application startup.
   * Prevents silent failure where the first user request discovers the
   * missing key 30 minutes after deployment.
   */
  onModuleInit(): void {
    const key = this.configService.get<string>('COHERE_API_KEY');
    if (!key) {
      throw new Error(
        'COHERE_API_KEY is not set. Cross-encoder reranking requires a Cohere API key. ' +
          'Set COHERE_API_KEY in your .env file or disable reranking.',
      );
    }
    this.apiKey = key;
    this.logger.log('Cohere Reranker initialized (rerank-v3.5)');
  }

  /**
   * Rerank documents using Cohere's rerank-v3.5 cross-encoder model.
   *
   * Tweak 1: Uses Axios native { timeout: 2000 } instead of Promise.race.
   * On timeout, Axios throws AxiosError with code: 'ECONNABORTED',
   * which rerankWithFallback() catches and falls back to DB ordering.
   *
   * @param query     - The reformulated (coreference-resolved) search query
   * @param documents - Array of { id, text } documents to rerank
   * @param topN      - Number of best results to return
   * @returns RerankResult[] sorted by relevance_score descending
   */
  async rerank(
    query: string,
    documents: RerankDocument[],
    topN: number,
  ): Promise<RerankResult[]> {
    this.logger.debug(
      `Reranking ${documents.length} documents for query: "${query.substring(0, 50)}..."`,
    );

    const { data } = await this.httpService.axiosRef.post<CohereRerankResponse>(
      COHERE_RERANK_URL,
      {
        model: COHERE_MODEL,
        query,
        documents: documents.map((d) => d.text),
        top_n: topN,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    // Map Cohere response back to RerankResult using original document IDs
    const results: RerankResult[] = data.results.map(
      (item): RerankResult => ({
        id: documents[item.index].id,
        relevanceScore: item.relevance_score,
        index: item.index,
      }),
    );

    this.logger.debug(
      `Reranked: top score=${results[0]?.relevanceScore?.toFixed(3)}, ` +
        `bottom score=${results[results.length - 1]?.relevanceScore?.toFixed(3)}`,
    );

    return results;
  }
}
