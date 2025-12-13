// src/attachments/entities/attachment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { User } from '../../users/entities/user.entity';
import { Release } from '../../releases/entities/release.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity({ name: 'attachments' })
@Index('IDX_attachment_issue_id', ['issueId'])
@Index('IDX_attachment_project_id', ['projectId'])
@Index('IDX_attachment_uploaded_by', ['uploaderId'])
@Index('IDX_attachment_created_at', ['createdAt'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  projectId?: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project?: Project;

  @Column({ nullable: true })
  issueId?: string;
  @ManyToOne(() => Issue, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'issueId' })
  issue?: Issue;

  @Column({ nullable: true })
  releaseId?: string;
  @ManyToOne(() => Release, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'releaseId' })
  release?: Release;

  @Column()
  uploaderId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaderId' })
  uploader: User;

  @Column()
  filename: string;

  @Column()
  filepath: string; // local path or public URL

  @Column({ nullable: true })
  originalName?: string; // Original filename

  @Column({ nullable: true })
  fileSize?: number; // File size in bytes

  @Column({ nullable: true })
  mimeType?: string; // MIME type

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  epicId?: string; // Deprecated: Epics now use Issue with type='Epic'

  @Column({ nullable: true })
  sprintId?: string;
  @ManyToOne(() => Sprint, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'sprintId' })
  sprint?: Sprint;

  @Column({ nullable: true })
  commentId?: string;
  @ManyToOne(() => Comment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'commentId' })
  comment?: Comment;
}
