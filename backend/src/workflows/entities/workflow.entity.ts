import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
// Forward reference to avoid circular dependency

export interface WorkflowNode {
  id: string;
  type:
    | 'start'
    | 'end'
    | 'status'
    | 'decision'
    | 'action'
    | 'approval'
    | 'parallel'
    | 'merge';
  name: string;
  description?: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
  condition?: string;
  label?: string;
  config?: Record<string, any>;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  variables?: Record<string, any>;
  settings?: {
    allowParallelExecution?: boolean;
    maxExecutionTime?: number;
    retryOnFailure?: boolean;
    retryCount?: number;
  };
}

export interface WorkflowMetadata {
  version: number;
  lastModified: Date;
  createdBy: string;
  tags?: string[];
  category?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  estimatedExecutionTime?: number;
  usageCount?: number;
  successRate?: number;
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

@Entity({ name: 'workflows' })
@Index(['projectId', 'isActive'])
@Index(['createdBy', 'status'])
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  definition: WorkflowDefinition;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: WorkflowMetadata;

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.DRAFT,
  })
  status: WorkflowStatus;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 1 })
  version: number;

  @Column({ nullable: true })
  parentWorkflowId?: string;

  @ManyToOne(() => Workflow, { nullable: true })
  @JoinColumn({ name: 'parentWorkflowId' })
  parentWorkflow?: Workflow;

  @OneToMany(() => Workflow, (workflow) => workflow.parentWorkflow)
  childWorkflows: Workflow[];

  @Column()
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @Column({ type: 'varchar', nullable: true })
  category?: string;

  @Column({ type: 'varchar', nullable: true })
  icon?: string;

  @Column({ type: 'varchar', nullable: true })
  color?: string;

  @Column({ default: 0 })
  executionCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutedAt?: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  successRate?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  averageExecutionTime?: number;

  @OneToMany('WorkflowExecution', (execution: any) => execution.workflow)
  executions: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
