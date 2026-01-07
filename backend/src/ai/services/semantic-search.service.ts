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
