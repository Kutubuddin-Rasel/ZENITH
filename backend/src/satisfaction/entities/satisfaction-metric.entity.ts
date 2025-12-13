import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'satisfaction_metrics' })
@Index(['userId', 'metric'])
@Index(['metric', 'timestamp'])
export class SatisfactionMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  metric: string;

  @Column('decimal', { precision: 10, scale: 2 })
  value: number;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, unknown>;

  @CreateDateColumn()
  timestamp: Date;
}
