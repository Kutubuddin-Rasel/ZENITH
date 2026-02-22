import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from '../../core/tenant/tenant-context.service';
import { EmbeddingsService } from './embeddings.service';

/**
 * Semantic search result with similarity score
 */
export interface SemanticSearchResult {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName?: string;
  status: string;
  similarity: number; // 0-1 where 1 is most similar
}

/**
 * Search options for semantic search
 */
export interface SemanticSearchOptions {
  projectId?: string; // Limit to specific project
  limit?: number; // Max results (default: 10)
  minSimilarity?: number; // Minimum similarity threshold (default: 0.5)
  excludeIssueIds?: string[]; // Exclude specific issues
}

/**
 * Raw result from semantic search query
 */
interface SemanticSearchRow {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName: string | null;
  status: string;
  similarity: string;
}

/**
 * Raw result from source issue query
 */
interface SourceIssueRow {
  embedding_vector: unknown;
  projectId: string;
}

/**
 * Raw extension check result
 */
interface ExtensionCheckRow {
  1?: number;
}

/**
 * Options for hybrid search queries.
 */
export interface HybridSearchOptions {
  projectId?: string;
  limit?: number;
  minSimilarity?: number;
}

/**
 * Result from hybrid search with both vector and text scores.
 */
export interface HybridSearchResult {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectKey: string;
  projectName: string;
  issueNumber: number;
  status: string;
  vectorScore: number;
  textScore: number;
  hybridScore: number;
}

/**
 * Raw row from the hybrid search SQL query.
 * All numeric fields come as strings from pg driver.
 */
interface HybridSearchRow {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectKey: string;
  projectName: string;
  issueNumber: string;
  status: string;
  vector_score: string;
  text_score: string;
  hybrid_score: string;
}

/**
 * SemanticSearchService
 *
 * Provides semantic/vector similarity search for issues using pgvector.
 * Uses cosine similarity to find issues semantically related to a query.
 *
 * SECURITY: All queries are automatically scoped to the current tenant's
 * organization via the TenantContext to prevent cross-tenant data leaks.
 */
@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);
  private vectorExtensionAvailable: boolean | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddingsService: EmbeddingsService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Search issues by semantic similarity to a query
   *
   * @param query - Natural language search query
   * @param options - Search options (projectId, limit, minSimilarity)
   * @returns Array of issues with similarity scores, ordered by relevance
   */
  async searchIssues(
    query: string,
    options: SemanticSearchOptions = {},
  ): Promise<SemanticSearchResult[]> {
    const {
      projectId,
      limit = 10,
      minSimilarity = 0.4,
      excludeIssueIds = [],
    } = options;

    // Get current tenant for security scoping
    const organizationId = this.tenantContext.getTenantId();
    if (!organizationId) {
      this.logger.warn('Semantic search called without tenant context');
      return [];
    }

    // Check if vector extension is available
    if (!(await this.isVectorExtensionAvailable())) {
      this.logger.warn('pgvector not available, returning empty results');
      return [];
    }

    try {
      // Generate embedding for the search query
      const queryEmbedding = await this.embeddingsService.create(query);

      // Build the search query with tenant isolation
      // Uses cosine distance: 1 - (a <=> b) = similarity (0-1)
      const params: (string | number | string[])[] = [
        JSON.stringify(queryEmbedding),
        organizationId,
        minSimilarity,
        limit,
      ];

      let excludeClause = '';
      if (excludeIssueIds.length > 0) {
        excludeClause = `AND i.id NOT IN (${excludeIssueIds.map((_, idx) => `$${params.length + idx + 1}`).join(', ')})`;
        params.push(...excludeIssueIds);
      }

      let projectClause = '';
      if (projectId) {
        projectClause = `AND i."projectId" = $${params.length + 1}`;
        params.push(projectId);
      }

      const results: SemanticSearchRow[] = await this.dataSource.query(
        `
        SELECT 
          i.id,
          i.title,
          i.description,
          i."projectId",
          p.name as "projectName",
          i.status,
          1 - (i.embedding_vector <=> $1::vector) as similarity
        FROM issues i
        INNER JOIN projects p ON i."projectId" = p.id
        WHERE p."organizationId" = $2
          AND i.embedding_vector IS NOT NULL
          AND 1 - (i.embedding_vector <=> $1::vector) >= $3
          ${excludeClause}
          ${projectClause}
        ORDER BY i.embedding_vector <=> $1::vector
        LIMIT $4
        `,
        params,
      );

      return results.map(
        (r): SemanticSearchResult => ({
          id: r.id,
          title: r.title,
          description: r.description,
          projectId: r.projectId,
          projectName: r.projectName ?? undefined,
          status: r.status,
          similarity: parseFloat(r.similarity),
        }),
      );
    } catch (error) {
      this.logger.error('Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Find issues similar to a specific issue
   *
   * @param issueId - The issue to find similar issues for
   * @param limit - Maximum number of results
   * @returns Array of similar issues
   */
  async findSimilarIssues(
    issueId: string,
    limit = 5,
  ): Promise<SemanticSearchResult[]> {
    const organizationId = this.tenantContext.getTenantId();
    if (!organizationId) return [];

    if (!(await this.isVectorExtensionAvailable())) return [];

    try {
      // Get the source issue's embedding
      const sourceIssue: SourceIssueRow[] = await this.dataSource.query(
        `
        SELECT i.embedding_vector, i."projectId"
        FROM issues i
        INNER JOIN projects p ON i."projectId" = p.id
        WHERE i.id = $1 AND p."organizationId" = $2
        `,
        [issueId, organizationId],
      );

      if (sourceIssue.length === 0 || !sourceIssue[0].embedding_vector) {
        return [];
      }

      // Find similar issues (excluding the source)
      const results: SemanticSearchRow[] = await this.dataSource.query(
        `
        SELECT 
          i.id,
          i.title,
          i.description,
          i."projectId",
          p.name as "projectName",
          i.status,
          1 - (i.embedding_vector <=> $1) as similarity
        FROM issues i
        INNER JOIN projects p ON i."projectId" = p.id
        WHERE p."organizationId" = $2
          AND i.id != $3
          AND i.embedding_vector IS NOT NULL
        ORDER BY i.embedding_vector <=> $1
        LIMIT $4
        `,
        [sourceIssue[0].embedding_vector, organizationId, issueId, limit],
      );

      return results.map(
        (r): SemanticSearchResult => ({
          id: r.id,
          title: r.title,
          description: r.description,
          projectId: r.projectId,
          projectName: r.projectName ?? undefined,
          status: r.status,
          similarity: parseFloat(r.similarity),
        }),
      );
    } catch (error) {
      this.logger.error('Find similar issues failed:', error);
      return [];
    }
  }

  // ============================================================
  // HYBRID SEARCH — Vector + Full-Text with CTE Normalization
  // ============================================================

  /**
   * Hybrid Search: Vector Similarity + Full-Text Ranking with CTE normalization.
   *
   * ARCHITECTURE:
   *   1. raw_scores CTE: Calculates unbounded vector_score (0-1) and
   *      raw_text_score (0-∞) with strict tenant isolation.
   *   2. normalized CTE: Scales raw_text_score into 0-1 using MAX() OVER()
   *      window function across the filtered result set.
   *   3. Final SELECT: Applies 70/30 weighting (vector/text) and sorts.
   *
   * SECURITY: Tenant wall enforced via INNER JOIN + WHERE organizationId = $2.
   * organizationId comes from TenantContext (JWT), never user input.
   *
   * DEEP THINKING — EMPTY TSQUERY SAFETY:
   * If the title contains only stop-words (e.g., "The and to"),
   * plainto_tsquery('english', ...) returns an empty query.
   * ts_rank() with an empty tsquery returns 0 (not an error),
   * but we wrap it in COALESCE as defense-in-depth.
   * The GREATEST(MAX(...), 1e-10) in the normalization CTE prevents
   * division by zero when ALL text scores are 0.
   *
   * DEEP THINKING — WINDOW FUNCTION:
   * MAX(raw_text_score) OVER() computes the maximum across the ENTIRE
   * filtered result set (no PARTITION BY), giving us a global max within
   * the tenant/project scope to normalize against.
   *
   * @param tenantId - Organization ID for tenant isolation
   * @param queryText - Raw text for full-text search (plainto_tsquery)
   * @param embedding - Pre-computed embedding vector (1536 dims)
   * @param options - projectId filter, limit, minSimilarity floor
   */
  async hybridSearchIssues(
    tenantId: string,
    queryText: string,
    embedding: number[],
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const { projectId, limit = 5, minSimilarity = 0.78 } = options;

    if (!(await this.isVectorExtensionAvailable())) {
      this.logger.warn('pgvector not available, returning empty results');
      return [];
    }

    try {
      const embeddingStr = `[${embedding.join(',')}]`;

      // Build parameterized query
      const params: (string | number)[] = [
        embeddingStr, // $1 - embedding vector
        tenantId, // $2 - organization ID (tenant wall)
        minSimilarity, // $3 - minimum cosine similarity threshold
        limit, // $4 - max results
        queryText, // $5 - raw text for plainto_tsquery
      ];

      let projectClause = '';
      if (projectId) {
        projectClause = `AND i."projectId" = $${params.length + 1}`;
        params.push(projectId);
      }

      const rows: HybridSearchRow[] = await this.dataSource.query(
        `
        -- CTE 1: Calculate raw scores with tenant isolation
        WITH raw_scores AS (
          SELECT
            i.id,
            i.title,
            i.description,
            i."projectId",
            p.key AS "projectKey",
            p.name AS "projectName",
            i.number AS "issueNumber",
            i.status,
            -- Vector similarity (cosine): bounded 0-1
            1 - (i.embedding_vector <=> $1::vector) AS vector_score,
            -- Full-text relevance: UNBOUNDED (can exceed 1.0)
            -- COALESCE handles NULL searchVector; ts_rank returns 0 for empty tsquery
            COALESCE(
              ts_rank(i."searchVector", plainto_tsquery('english', $5)),
              0
            ) AS raw_text_score
          FROM issues i
          INNER JOIN projects p ON i."projectId" = p.id
          WHERE p."organizationId" = $2
            AND i.embedding_vector IS NOT NULL
            AND i."isArchived" = false
            AND 1 - (i.embedding_vector <=> $1::vector) >= $3
            ${projectClause}
        ),
        -- CTE 2: Normalize text score into 0-1 via max-scaling
        normalized AS (
          SELECT *,
            CASE
              WHEN GREATEST(MAX(raw_text_score) OVER(), 1e-10) > 1e-10
              THEN raw_text_score / GREATEST(MAX(raw_text_score) OVER(), 1e-10)
              ELSE 0
            END AS text_score
          FROM raw_scores
        )
        -- Final: Apply 70/30 weighting and sort
        SELECT
          id,
          title,
          description,
          "projectId",
          "projectKey",
          "projectName",
          "issueNumber",
          status,
          vector_score,
          text_score,
          (0.7 * vector_score + 0.3 * text_score) AS hybrid_score
        FROM normalized
        ORDER BY hybrid_score DESC
        LIMIT $4
        `,
        params,
      );

      return rows.map(
        (r): HybridSearchResult => ({
          id: r.id,
          title: r.title,
          description: r.description,
          projectId: r.projectId,
          projectKey: r.projectKey,
          projectName: r.projectName,
          issueNumber: parseInt(r.issueNumber, 10),
          status: r.status,
          vectorScore: parseFloat(r.vector_score),
          textScore: parseFloat(r.text_score),
          hybridScore: parseFloat(r.hybrid_score),
        }),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Hybrid search failed: ${message}`);
      return [];
    }
  }

  /**
   * Check if pgvector extension is available
   * Result is cached after first check
   */
  async isVectorExtensionAvailable(): Promise<boolean> {
    if (this.vectorExtensionAvailable !== null) {
      return this.vectorExtensionAvailable;
    }

    try {
      const result: ExtensionCheckRow[] = await this.dataSource.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
      );
      this.vectorExtensionAvailable = result.length > 0;
    } catch {
      this.vectorExtensionAvailable = false;
    }

    if (!this.vectorExtensionAvailable) {
      this.logger.warn(
        'pgvector extension not available - semantic search disabled',
      );
    }

    return this.vectorExtensionAvailable;
  }

  /**
   * Generate and store embedding for an issue
   * Called by the issue service when creating/updating issues
   */
  async generateIssueEmbedding(
    issueId: string,
    title: string,
    description?: string,
  ): Promise<void> {
    if (!(await this.isVectorExtensionAvailable())) return;

    try {
      // Combine title and description for embedding
      const text = `${title}\n\n${description || ''}`.trim();
      if (!text) return;

      // Generate embedding
      const embedding = await this.embeddingsService.create(text);

      // Store both in float array and vector columns
      await this.dataSource.query(
        `
        UPDATE issues 
        SET embedding = $1, 
            embedding_vector = $1::vector(1536)
        WHERE id = $2
        `,
        [embedding, issueId],
      );

      this.logger.debug(`Generated embedding for issue ${issueId}`);
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding for issue ${issueId}:`,
        error,
      );
    }
  }
}
