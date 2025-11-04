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
import { Workflow } from './workflow.entity';

export interface ExecutionContext {
  triggerEvent: string;
  triggerData: Record<string, any>;
  variables: Record<string, any>;
  userId?: string;
  projectId: string;
  issueId?: string;
  sprintId?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  nodeId?: string;
  actionId?: string;
  data?: Record<string, any>;
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

@Entity({ name: 'workflow_executions' })
@Index(['workflowId', 'status'])
@Index(['status', 'startedAt'])
@Index(['triggerEvent', 'startedAt'])
export class WorkflowExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  @ManyToOne(() => Workflow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  @Column()
  triggerEvent: string;

  @Column({ type: 'jsonb' })
  context: ExecutionContext;

  @Column({
    type: 'enum',
    enum: ExecutionStatus,
    default: ExecutionStatus.PENDING,
  })
  status: ExecutionStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  executionLog?: ExecutionLog[];

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, any>;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  executionTime?: number;

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @Column({ type: 'integer', default: 3 })
  maxRetries: number;

  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    priority?: number;
    timeout?: number;
    tags?: string[];
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
