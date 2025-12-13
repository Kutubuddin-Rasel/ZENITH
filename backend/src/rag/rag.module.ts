import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { MembershipModule } from '../membership/membership.module';
import { CacheModule } from '../cache/cache.module';
import { Document } from './entities/document.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { IngestionService } from './services/ingestion.service';
import { RetrievalService } from './services/retrieval.service';
import { RagController } from './controllers/rag.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentSegment]),
    AiModule,
    MembershipModule,
    CacheModule,
  ],
  controllers: [RagController],
  providers: [IngestionService, RetrievalService],
  exports: [IngestionService, RetrievalService],
})
export class RagModule {}
