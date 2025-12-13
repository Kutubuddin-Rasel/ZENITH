import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AIPrediction } from '../interfaces/ai-prediction.interface';

/**
 * AI Prediction Log Entity
 * Logs all AI predictions for offline evaluation and model improvement
 * Shadow mode: tracks accuracy of predictions vs actual outcomes
 */
@Entity('ai_prediction_logs')
@Index(['issueId'])
@Index(['createdAt'])
@Index(['wasAccurate'])
export class AIPredictionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  issueId: string;

  @Column('jsonb')
  prediction: AIPrediction;

  @Column('jsonb', { nullable: true })
  actualOutcome: {
    priority: string;
    labels: string[];
  };

  @Column({ nullable: true })
  wasAccurate: boolean;

  @Column({ nullable: true })
  model: string;

  @Column('float', { nullable: true })
  latencyMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
