import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity({ name: 'projects' })
@Unique(['key'])
@Unique(['name'])
@Index('IDX_project_name', ['name'])
@Index('IDX_project_organization_id', ['organizationId']) // OPTIMIZED: Fast org filtering
@Index('IDX_project_archived', ['isArchived']) // OPTIMIZED: Fast archive filtering
@Index('IDX_project_org_archived', ['organizationId', 'isArchived'])
@Index('IDX_project_created_at', ['createdAt'])
@Index('IDX_project_updated_at', ['updatedAt'])
@Index('IDX_project_deleted_at', ['deletedAt']) // Soft delete index
@Index('IDX_project_org_deleted', ['organizationId', 'deletedAt']) // Tenant + soft delete
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  key: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid', nullable: true })
  templateId?: string;

  @Column({ type: 'jsonb', nullable: true })
  templateConfig?: {
    defaultSprintDuration: number;
    defaultIssueTypes: string[];
    defaultPriorities: string[];
    defaultStatuses: string[];
    suggestedRoles: Array<{ role: string; description: string }>;
    smartDefaults: {
      enableTimeTracking: boolean;
      enableStoryPoints: boolean;
      defaultStoryPointScale: number[];
    };
  };

  @Column({ default: false })
  isArchived: boolean;

  // Organization relationship
  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // =====================
  // Soft Delete Fields
  // =====================

  /**
   * Soft delete timestamp - when set, project is considered deleted
   * Use softDelete() method instead of remove() to set this
   */
  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  /**
   * User who performed the soft delete (for audit trail)
   */
  @Column({ type: 'uuid', nullable: true })
  deletedBy: string | null;
}
