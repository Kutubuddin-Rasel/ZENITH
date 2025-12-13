import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProjectCategory {
  SOFTWARE_DEVELOPMENT = 'software_development',
  MARKETING = 'marketing',
  PRODUCT_LAUNCH = 'product_launch',
  RESEARCH = 'research',
  EVENT_PLANNING = 'event_planning',
  WEBSITE_DEVELOPMENT = 'website_development',
  MOBILE_DEVELOPMENT = 'mobile_development',
  DATA_ANALYSIS = 'data_analysis',
  DESIGN = 'design',
  SALES = 'sales',
  CUSTOM = 'custom',
}

export enum ProjectMethodology {
  AGILE = 'agile',
  SCRUM = 'scrum',
  KANBAN = 'kanban',
  WATERFALL = 'waterfall',
  HYBRID = 'hybrid',
  LEAN = 'lean',
}

export interface TemplateConfig {
  // Project settings
  defaultSprintDuration: number; // days
  defaultIssueTypes: string[];
  defaultPriorities: string[];
  defaultStatuses: string[];

  // Team structure
  suggestedRoles: Array<{
    role: string;
    description: string;
    permissions: string[];
  }>;

  // Workflow configuration
  workflowStages: Array<{
    name: string;
    description: string;
    order: number;
    isDefault: boolean;
  }>;

  // Board configuration
  defaultBoards: Array<{
    name: string;
    type: 'kanban' | 'scrum' | 'custom';
    columns: Array<{
      name: string;
      status: string;
      order: number;
    }>;
  }>;

  // Milestones and phases
  defaultMilestones: Array<{
    name: string;
    description: string;
    estimatedDuration: number; // days
    order: number;
  }>;

  // Smart defaults
  smartDefaults: {
    autoAssignIssues: boolean;
    suggestDueDates: boolean;
    enableTimeTracking: boolean;
    enableStoryPoints: boolean;
    defaultStoryPointScale: number[];
  };
}

@Entity({ name: 'project_templates' })
@Index(['category', 'isSystemTemplate'])
@Index(['methodology', 'isSystemTemplate'])
@Index('IDX_template_recommendation', ['category', 'methodology', 'isActive']) // Optimized for recommendation queries
@Index('IDX_template_active_usage', ['isActive', 'usageCount']) // For popular/trending queries
export class ProjectTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ProjectCategory,
    default: ProjectCategory.CUSTOM,
  })
  category: ProjectCategory;

  @Column({
    type: 'enum',
    enum: ProjectMethodology,
    default: ProjectMethodology.AGILE,
  })
  methodology: ProjectMethodology;

  @Column({ type: 'jsonb' })
  templateConfig: TemplateConfig;

  @Column({ default: true })
  isSystemTemplate: boolean;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  createdBy?: string;

  @Column({ type: 'varchar', nullable: true })
  icon?: string;

  @Column({ type: 'varchar', nullable: true })
  color?: string;

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
