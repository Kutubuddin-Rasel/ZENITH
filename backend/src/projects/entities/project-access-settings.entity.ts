import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * ProjectAccessSettings Entity
 * Stores access control configuration for a project.
 * One-to-One relationship with Project.
 */
@Entity({ name: 'project_access_settings' })
@Index('IDX_project_access_settings_project_id', ['projectId'], {
  unique: true,
})
export class ProjectAccessSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @OneToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  // Access Control Master Switch
  @Column({ default: true })
  accessControlEnabled: boolean;

  // Default policy when no rules match: 'deny' or 'allow'
  @Column({ default: 'deny' })
  defaultPolicy: string;

  // IP Allowlist - array of IP addresses or CIDR ranges
  @Column({ type: 'simple-array', nullable: true })
  ipAllowlist: string[];

  // Country Allowlist - array of ISO country codes
  @Column({ type: 'simple-array', nullable: true })
  countryAllowlist: string[];

  // Feature Toggles
  @Column({ default: true })
  geographicFiltering: boolean;

  @Column({ default: true })
  timeBasedFiltering: boolean;

  @Column({ default: false })
  emergencyAccessEnabled: boolean;

  @Column({ default: true })
  userSpecificRules: boolean;

  @Column({ default: true })
  roleBasedRules: boolean;

  // Limits
  @Column({ default: 10 })
  maxRulesPerUser: number;

  // Maintenance Settings
  @Column({ default: true })
  autoCleanupEnabled: boolean;

  @Column({ default: 24 })
  cleanupIntervalHours: number;

  // Logging & Notifications
  @Column({ default: true })
  notificationEnabled: boolean;

  @Column({ default: true })
  logAllAccess: boolean;

  @Column({ default: false })
  requireApprovalForNewRules: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
