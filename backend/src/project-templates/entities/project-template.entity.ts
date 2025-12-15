import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  IdealTeamSize,
  TemplateFeatures,
  TemplateComplexity,
} from '../constants/industry.constants';

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

  // ============================================
  // NEW: Industry-Level Matching Fields
  // ============================================

  /**
   * Industries this template is optimized for
   * e.g., ['technology', 'healthcare', 'fintech']
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  industries?: string[];

  /**
   * Ideal team size range for this template
   */
  @Column({ type: 'jsonb', nullable: true })
  idealTeamSize?: IdealTeamSize;

  /**
   * Complexity rating: simple, medium, complex
   */
  @Column({ type: 'varchar', nullable: true, default: 'medium' })
  complexity?: TemplateComplexity;

  /**
   * Feature flags for direct matching
   */
  @Column({ type: 'jsonb', nullable: true })
  features?: TemplateFeatures;

  /**
   * Keywords for semantic/AI matching
   * e.g., ['clinic', 'patient', 'medical']
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  matchKeywords?: string[];

  /**
   * Best-for hints (who this template is designed for)
   * e.g., ['startups', 'agencies', 'enterprise']
   */
  @Column({ type: 'jsonb', nullable: true, default: [] })
  bestFor?: string[];

  // ============================================
  // Timestamps
  // ============================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
