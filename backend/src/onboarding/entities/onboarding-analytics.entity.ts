import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OnboardingStep } from './onboarding-progress.entity';

@Entity({ name: 'onboarding_analytics' })
export class OnboardingAnalytics {
  @PrimaryColumn({ type: 'enum', enum: OnboardingStep })
  stepId: OnboardingStep;

  @Column({ type: 'integer', default: 0 })
  startedCount: number;

  @Column({ type: 'integer', default: 0 })
  completedCount: number;

  @Column({ type: 'integer', default: 0 })
  skippedCount: number;

  @Column({ type: 'double precision', default: 0 })
  avgTimeSpent: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
