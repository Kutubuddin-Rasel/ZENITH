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

export interface WorkflowTemplateDefinition {
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    description?: string;
    position: { x: number; y: number };
    config: Record<string, any>;
  }>;
  connections: Array<{
    id: string;
    source: string;
    target: string;
    condition?: string;
    label?: string;
  }>;
  variables?: Record<string, any>;
  settings?: Record<string, any>;
}

export interface WorkflowTemplateMetadata {
  version: string;
  author: string;
  category: string;
  tags: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedSetupTime: number; // minutes
  requiredPermissions: string[];
  compatibleProjects: string[];
  lastUpdated: Date;
}

export enum WorkflowTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  PRIVATE = 'private',
}

@Entity({ name: 'workflow_templates' })
@Index(['category', 'isPublic'])
@Index(['status', 'usageCount'])
@Index(['createdBy', 'status'])
export class WorkflowTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column()
  category: string;

  @Column({ type: 'jsonb' })
  templateDefinition: WorkflowTemplateDefinition;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: WorkflowTemplateMetadata;

  @Column({
    type: 'enum',
    enum: WorkflowTemplateStatus,
    default: WorkflowTemplateStatus.DRAFT,
  })
  status: WorkflowTemplateStatus;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  rating?: number;

  @Column({ type: 'integer', default: 0 })
  reviewCount: number;

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @Column({ type: 'varchar', nullable: true })
  icon?: string;

  @Column({ type: 'varchar', nullable: true })
  color?: string;

  @Column({ type: 'varchar', nullable: true })
  previewImage?: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ type: 'jsonb', nullable: true })
  requirements?: {
    minTeamSize?: number;
    requiredRoles?: string[];
    requiredFeatures?: string[];
    compatibleProjectTypes?: string[];
  };

  @Column()
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'jsonb', nullable: true })
  reviews?: Array<{
    id: string;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: Date;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  analytics?: {
    totalDownloads: number;
    successfulInstalls: number;
    averageSetupTime: number;
    commonCustomizations: string[];
    errorRate: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
