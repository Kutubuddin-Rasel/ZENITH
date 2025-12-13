// src/releases/entities/release-attachment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Release } from './release.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'release_attachments' })
export class ReleaseAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  releaseId: string;

  @ManyToOne(() => Release, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'releaseId' })
  release: Release;

  @Column()
  uploaderId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaderId' })
  uploader: User;

  @Column()
  filename: string;

  @Column()
  filepath: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ type: 'bigint', nullable: true })
  fileSize?: number;

  @CreateDateColumn()
  createdAt: Date;
}
