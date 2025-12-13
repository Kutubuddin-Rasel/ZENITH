// src/attachments/entities/attachment-history.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'attachment_history' })
export class AttachmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  attachmentId: string; // Original attachment ID

  @Column()
  filename: string;

  @Column()
  originalName: string;

  @Column({
    type: 'enum',
    enum: ['UPLOADED', 'DELETED'],
  })
  action: 'UPLOADED' | 'DELETED';

  @Column()
  performedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'performedById' })
  performedBy: User;

  @Column({ nullable: true })
  fileSize?: number;

  @Column({ nullable: true })
  mimeType?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    issueId?: string;
    releaseId?: string;
    epicId?: string;
    sprintId?: string;
    commentId?: string;
  };
}
