import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export interface SurveyQuestion {
  id: string;
  question: string;
  answer: number; // 1-5 scale
  context?: string;
}

@Entity({ name: 'satisfaction_surveys' })
@Index(['userId', 'type'])
@Index(['type', 'timestamp'])
export class SatisfactionSurvey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  type: 'onboarding' | 'feature' | 'general';

  @Column({ type: 'jsonb' })
  questions: SurveyQuestion[];

  @Column('decimal', { precision: 3, scale: 2 })
  overallScore: number;

  @Column({ type: 'text', nullable: true })
  feedback?: string;

  @CreateDateColumn()
  timestamp: Date;
}
