import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { User } from '../../users/entities/user.entity';
import {
  AIPrediction,
  AISuggestionStatus,
} from '../interfaces/ai-prediction.interface';

/**
 * AI Suggestion Entity
 * Stores AI-generated suggestions for user review when confidence is between 0.75-0.95
 */
@Entity('ai_suggestions')
@Index(['issueId', 'status'])
@Index(['status', 'expiresAt'])
export class AISuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  issueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;

  @Column('jsonb')
  prediction: AIPrediction;

  @Column('float')
  confidence: number;

  @Column({
    type: 'enum',
    enum: AISuggestionStatus,
    default: AISuggestionStatus.PENDING,
  })
  status: AISuggestionStatus;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  reviewedById: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy: User;

  @Column({ nullable: true })
  reviewedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
