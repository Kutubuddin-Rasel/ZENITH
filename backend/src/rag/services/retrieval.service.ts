import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmbeddingsService } from '../../ai/services/embeddings.service';
import { DocumentSegment } from '../entities/document-segment.entity';

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Search for context relevant to the query.
   */
  async query(
    projectId: string,
    text: string,
    limit = 5,
  ): Promise<DocumentSegment[]> {
    this.logger.log(`Searching for context: "${text}" in project ${projectId}`);

    const embedding = await this.embeddingsService.create(text);
    if (!embedding || embedding.length === 0) {
      return [];
    }

    // Format embedding vector for Postgres
    const embeddingStr = `[${embedding.join(',')}]`;

    // Perform HNSW similarity search
    // We join documents to filter by project

    const results: DocumentSegment[] = (await this.dataSource.query(
      `
      SELECT ds.*, (ds.embedding <-> $1) as distance
      FROM document_segments ds
      WHERE ds."projectId" = $2
      ORDER BY distance ASC
      LIMIT $3
      `,
      [embeddingStr, projectId, limit],
    )) as unknown as DocumentSegment[];

    return results;
  }
}
