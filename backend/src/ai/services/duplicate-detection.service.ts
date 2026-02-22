/**
 * Duplicate Detection Service
 *
 * Business logic for detecting duplicate issues using hybrid search.
 * Combines pre-computed embeddings with full-text ranking to find
 * semantically similar existing issues before a user creates a new one.
 *
 * ARCHITECTURE (per arch-single-responsibility):
 *   Controller → THIS SERVICE → SemanticSearchService → PostgreSQL
 *
 * THRESHOLD CALIBRATION (ada-002 specific):
 *   Ada-002 embeddings are "squished" — unrelated sentences average 0.72-0.81.
 *   Floor raised to 0.78 to eliminate noise. Three confidence tiers:
 *     >= 0.92 → high (near-identical, very likely duplicate)
 *     >= 0.85 → moderate (strong semantic overlap)
 *     >= 0.78 → weak (possibly related)
 */

import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import {
  SemanticSearchService,
  HybridSearchResult,
} from './semantic-search.service';
import {
  DetectDuplicatesDto,
  DuplicateCandidate,
  DuplicateConfidence,
  DuplicateDetectionResponse,
} from '../dto/detect-duplicates.dto';

/** Minimum cosine similarity to consider (ada-002 noise floor) */
const MIN_SIMILARITY_THRESHOLD = 0.78;

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly semanticSearch: SemanticSearchService,
  ) {}

  /**
   * Detect potential duplicate issues for a new issue being created.
   *
   * Flow:
   *   1. Concatenate title + description for embedding quality
   *   2. Generate ada-002 embedding (1536 dims)
   *   3. Run hybrid search (vector + full-text) with tenant isolation
   *   4. Classify each match into confidence tiers
   *
   * @param dto - Validated input DTO (title, description, projectId)
   * @param tenantId - Organization ID from JWT (never from user input)
   * @returns Classified duplicate candidates above 0.78 threshold
   */
  async detectDuplicates(
    dto: DetectDuplicatesDto,
    tenantId: string,
  ): Promise<DuplicateDetectionResponse> {
    const textToEmbed = `${dto.title}\n\n${dto.description || ''}`.trim();

    // Step 1: Generate embedding (ada-002)
    const embedding = await this.embeddingsService.create(textToEmbed);

    if (!embedding || embedding.length === 0) {
      this.logger.warn(
        'Embedding generation failed or returned empty — returning no duplicates',
      );
      return {
        duplicates: [],
        totalChecked: 0,
        thresholdUsed: MIN_SIMILARITY_THRESHOLD,
      };
    }

    // Step 2: Hybrid search with tenant isolation
    const results: HybridSearchResult[] =
      await this.semanticSearch.hybridSearchIssues(
        tenantId,
        textToEmbed,
        embedding,
        {
          projectId: dto.projectId,
          limit: 5,
          minSimilarity: MIN_SIMILARITY_THRESHOLD,
        },
      );

    // Step 3: Classify matches into confidence tiers
    const duplicates: DuplicateCandidate[] = results.map(
      (result): DuplicateCandidate => ({
        issueId: result.id,
        issueKey: `${result.projectKey}-${result.issueNumber}`,
        title: result.title,
        status: result.status,
        similarity: Math.round(result.hybridScore * 1000) / 1000, // 3 decimal places
        confidence: this.classifyConfidence(result.hybridScore),
      }),
    );

    this.logger.log(
      `Duplicate detection for "${dto.title.substring(0, 50)}..." → ` +
        `${duplicates.length} matches (${duplicates.filter((d) => d.confidence === 'high').length} high)`,
    );

    return {
      duplicates,
      totalChecked: results.length,
      thresholdUsed: MIN_SIMILARITY_THRESHOLD,
    };
  }

  /**
   * Classify a hybrid score into a confidence tier.
   *
   * Thresholds calibrated for ada-002 embedding model:
   *   >= 0.92: near-identical text, very likely a duplicate
   *   >= 0.85: strong semantic overlap, probably related
   *   >= 0.78: weak similarity, possibly related
   */
  private classifyConfidence(score: number): DuplicateConfidence {
    if (score >= 0.92) return 'high';
    if (score >= 0.85) return 'moderate';
    return 'weak';
  }
}
