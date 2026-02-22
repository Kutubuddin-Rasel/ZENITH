import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '../entities/document.entity';
import { DocumentSegment } from '../entities/document-segment.entity';
import { EmbeddingsService } from '../../ai/services/embeddings.service';
import { DocumentChunkMetadata } from '../interfaces/rag.interfaces';

/**
 * Semantic chunking configuration.
 *
 * Separators are tried in order (most to least specific):
 *   paragraph → line → sentence → word → character
 *
 * EDGE CASE: A 2000-char string with no spaces/punctuation
 * falls through to '' (char-by-char split), then merges up
 * to chunkSize. Result: two clean 1000-char chunks with
 * 200-char overlap. No crash.
 */
const CHUNK_CONFIG = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
} as const;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  /** Reusable splitter instance (stateless, thread-safe) */
  private readonly textSplitter: RecursiveCharacterTextSplitter;

  constructor(
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepo: Repository<DocumentSegment>,
    private readonly embeddingsService: EmbeddingsService,
    private readonly dataSource: DataSource,
  ) {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_CONFIG.chunkSize,
      chunkOverlap: CHUNK_CONFIG.chunkOverlap,
      separators: [...CHUNK_CONFIG.separators],
    });
  }

  /**
   * Index a file content into the vector store.
   * Handles de-duplication via SHA-256 hash check.
   *
   * Pipeline: Raw text → Semantic chunking → Embedding → Store
   */
  async indexFile(
    projectId: string,
    path: string,
    content: string,
    mimeType = 'text/plain',
  ): Promise<{ status: string; docId: string }> {
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
      if (!doc) throw new Error('Failed to create or update document');
      doc = await manager.save(doc);

      // Semantic chunking via LangChain RecursiveCharacterTextSplitter
      const chunks = await this.semanticChunkText(content);

      // Generate embeddings and build segments with strict metadata
      const segments: DocumentSegment[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const embedding = await this.embeddingsService.create(chunk);

          const metadata: DocumentChunkMetadata = {
            projectId,
            documentId: doc.id,
            chunkIndex: i,
            totalChunks: chunks.length,
            sourceLength: content.length,
            sourcePath: path,
          };

          const segment = this.segmentRepo.create({
            documentId: doc.id,
            content: chunk,
            embedding,
            metadata,
          });
          segments.push(segment);
        } catch (e) {
          this.logger.warn(`Failed to embed chunk ${i} for ${path}`, e);
        }
      }

      await manager.save(DocumentSegment, segments);
      this.logger.log(`Indexed ${segments.length} segments for ${path}`);
    });

    return { status: 'indexed', docId: doc!.id };
  }

  /**
   * Split text using LangChain's RecursiveCharacterTextSplitter.
   *
   * Tries each separator in order: paragraph → line → sentence → word → char.
   * Preserves semantic boundaries instead of slicing mid-sentence.
   *
   * @param text - Raw text to chunk
   * @returns Array of semantically coherent text chunks
   */
  private async semanticChunkText(text: string): Promise<string[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    return this.textSplitter.splitText(text);
  }
}
