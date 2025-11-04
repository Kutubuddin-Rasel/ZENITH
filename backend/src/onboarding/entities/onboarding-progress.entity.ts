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
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

export enum OnboardingStep {
  WELCOME = 'welcome',
  PROFILE_SETUP = 'profile_setup',
  PREFERENCES = 'preferences',
  FIRST_PROJECT = 'first_project',
  TEAM_INVITE = 'team_invite',
  ISSUE_CREATION = 'issue_creation',
  SPRINT_PLANNING = 'sprint_planning',
  BOARD_VIEW = 'board_view',
  NOTIFICATIONS = 'notifications',
  REPORTS = 'reports',
  COMPLETED = 'completed',
}

export enum OnboardingStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export interface StepData {
  stepId: string;
  status: OnboardingStepStatus;
  startedAt?: Date;
  completedAt?: Date;
  skippedAt?: Date;
  data?: Record<string, any>;
  hints?: string[];
  nextSteps?: string[];
}

@Entity({ name: 'onboarding_progress' })
@Index(['userId', 'projectId'])
export class OnboardingProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  projectId?: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project?: Project;

  @Column({
    type: 'enum',
    enum: OnboardingStep,
    default: OnboardingStep.WELCOME,
  })
  currentStep: OnboardingStep;

  @Column({ type: 'jsonb' })
  steps: StepData[];

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  context?: {
    projectType?: string;
    teamSize?: number;
    methodology?: string;
    userRole?: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  analytics?: {
    totalTimeSpent: number; // minutes
    stepsCompleted: number;
    stepsSkipped: number;
    hintsUsed: number;
    helpArticlesViewed: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
