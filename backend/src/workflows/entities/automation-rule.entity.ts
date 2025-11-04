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
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

export interface TriggerDefinition {
  type:
    | 'field_change'
    | 'time_based'
    | 'user_action'
    | 'external_event'
    | 'scheduled';
  config: {
    field?: string;
    operator?:
      | 'equals'
      | 'not_equals'
      | 'contains'
      | 'greater_than'
      | 'less_than';
    value?: any;
    schedule?: string; // cron expression
    webhookUrl?: string;
    eventType?: string;
  };
}

export interface ConditionDefinition {
  id: string;
  field: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface ActionDefinition {
  id: string;
  type:
    | 'update_field'
    | 'send_notification'
    | 'assign_user'
    | 'create_issue'
    | 'update_status'
    | 'send_email'
    | 'webhook_call'
    | 'delay';
  config: {
    field?: string;
    value?: any;
    userId?: string;
    template?: string;
    url?: string;
    delay?: number;
    [key: string]: any;
  };
  order: number;
}

export enum AutomationRuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  TESTING = 'testing',
}

@Entity({ name: 'automation_rules' })
@Index(['projectId', 'isActive'])
@Index(['triggerType', 'isActive'])
@Index(['createdBy', 'status'])
export class AutomationRule {
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

  @Column()
  triggerType: string;

  @Column({ type: 'jsonb' })
  triggerConfig: TriggerDefinition;

  @Column({ type: 'jsonb', nullable: true })
  conditions?: ConditionDefinition[];

  @Column({ type: 'jsonb' })
  actions: ActionDefinition[];

  @Column({
    type: 'enum',
    enum: AutomationRuleStatus,
    default: AutomationRuleStatus.ACTIVE,
  })
  status: AutomationRuleStatus;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  executionCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextExecutionAt?: Date;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  successRate?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  averageExecutionTime?: number;

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

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    priority?: number;
    executionOrder?: number;
    retryCount?: number;
    maxRetries?: number;
    timeout?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
