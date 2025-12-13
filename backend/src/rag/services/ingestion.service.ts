import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { EmbeddingsService } from '../../ai/services/embeddings.service';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepo: Repository<DocumentSegment>,
    private readonly embeddingsService: EmbeddingsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Index a file content into the vector store.
   * Handles de-duplication via hash check.
   */
  async indexFile(
    projectId: string,
    path: string,
    content: string,
    mimeType = 'text/plain',
  ) {
    const hash = createHash('sha256').update(content).digest('hex');

    // Check existing document
    let doc = await this.docRepo.findOne({ where: { projectId, path } });

    if (doc && doc.hash === hash) {
      this.logger.debug(`File ${path} unchanged. Skipping.`);
      return { status: 'skipped', docId: doc.id };
    }

    this.logger.log(`Indexing file ${path} for project ${projectId}`);

    // Transactional update
    await this.dataSource.transaction(async (manager) => {
      if (!doc) {
        doc = this.docRepo.create({ projectId, path, hash, mimeType });
      } else {
        doc.hash = hash;
        doc.mimeType = mimeType;
        doc.lastIndexedAt = new Date();
        // Delete old segments
        await manager.delete(DocumentSegment, { documentId: doc.id });
      }
      if (!doc) throw new Error('Failed to create or update document'); // Should be impossible
      doc = await manager.save(doc);

      // Chunking logic (Simple split by lines or chars for now)
      // "Senior" approach would use a proper splitter (RecursiveCharacterTextSplitter)
      // I'll implement a basic recursive-like splitter function here to keep dependencies low or use regex.
      const chunks = this.chunkText(content, 1000, 100);

      // Generate Embeddings
      const segments: DocumentSegment[] = [];
      for (const chunk of chunks) {
        try {
          const embedding = await this.embeddingsService.create(chunk);
          const segment = this.segmentRepo.create({
            documentId: doc.id,
            content: chunk,
            embedding: embedding,
            metadata: { length: chunk.length },
          });
          segments.push(segment);
        } catch (e) {
          this.logger.warn(`Failed to embed chunk for ${path}`, e);
        }
      }

      await manager.save(DocumentSegment, segments);
      this.logger.log(`Indexed ${segments.length} segments for ${path}`);
    });

    return { status: 'indexed', docId: doc!.id };
  }

  private chunkText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    // Basic implementation
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }
    return chunks;
  }
}
