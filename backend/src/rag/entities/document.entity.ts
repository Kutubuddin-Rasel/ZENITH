import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { DocumentSegment } from './document-segment.entity';

@Entity({ name: 'documents' })
@Index('IDX_document_project_path', ['projectId', 'path'], { unique: true })
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  path: string;

  @Column()
  hash: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'timestamp', nullable: true })
  lastIndexedAt: Date;

  @OneToMany(() => DocumentSegment, (segment) => segment.document, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  segments: DocumentSegment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
