import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Integration } from './integration.entity';

export interface SearchMetadata extends Record<string, unknown> {
  source: string;
  url: string;
  author: string;
  timestamp: Date;
  tags: string[];
  priority: number;
}

@Entity('search_index')
@Index('IDX_search_vector', ['searchVector'])
export class SearchIndex {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  integrationId: string;

  @ManyToOne(() => Integration)
  integration: Integration;

  @Column()
  contentType: string;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column('jsonb')
  metadata: SearchMetadata;

  @Column({ type: 'tsvector', nullable: true })
  searchVector: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
