import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Document } from './document.entity';

@Entity({ name: 'document_segments' })
export class DocumentSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  documentId: string;

  @ManyToOne(() => Document, (doc) => doc.segments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: Document;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // Vector column (1536 dims for OpenAI)
  // We use 'float' array type approach for TypeORM compatibility
  // Migration will ensure it is 'vector(1536)'
  @Column('float', { array: true, nullable: true })
  embedding: number[];
}
