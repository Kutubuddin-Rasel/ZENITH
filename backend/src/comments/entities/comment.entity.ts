// src/comments/entities/comment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'comments' })
@Index('IDX_comment_issue_id', ['issueId'])
@Index('IDX_comment_user_id', ['authorId'])
@Index('IDX_comment_created_at', ['createdAt'])
// covers WHERE issueId ORDER BY createdAt,id — serves BOTH offset (no sort) and keyset seek
@Index('IDX_comment_issue_created_id', ['issueId', 'createdAt', 'id'])
@Index('IDX_comment_content_search', { synchronize: false }) // GIN index placeholder
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  issueId: string;
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;

  @Column()
  authorId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column('text')
  content: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
