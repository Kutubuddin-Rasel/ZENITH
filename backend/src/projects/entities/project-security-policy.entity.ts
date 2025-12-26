import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Project } from './project.entity';
import { User } from '../../users/entities/user.entity';

/**
 * ProjectSecurityPolicy Entity
 * Stores project-level security requirements that ALL members must satisfy
 *
 * Relation: One-to-One with Project
 * Purpose: "We require" vs User's "I enable"
 */
@Entity({ name: 'project_security_policies' })
export class ProjectSecurityPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  projectId: string;

  @OneToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  // ============ Authentication Requirements ============

  @Column({ type: 'boolean', default: false })
  require2FA: boolean; // All members must have 2FA enabled

  @Column({ type: 'int', default: 8 })
  requirePasswordMinLength: number; // Minimum password length (8-128)

  @Column({ type: 'boolean', default: false })
  requirePasswordComplexity: boolean; // Require special chars, mixed case, numbers

  @Column({ type: 'int', default: 0 })
  passwordMaxAgeDays: number; // 0 = no expiry, else force password change

  // ============ Session Requirements ============

  @Column({ type: 'int', default: 480 })
  maxSessionTimeoutMinutes: number; // Max allowed timeout for members (8 hours default)

  @Column({ type: 'boolean', default: false })
  enforceSessionTimeout: boolean; // Force project's timeout on members

  // ============ Access Requirements ============

  @Column({ type: 'boolean', default: false })
  requireIPAllowlist: boolean; // Members must be on project IP allowlist

  @Column({ type: 'simple-array', nullable: true })
  blockedCountries: string[]; // ISO country codes to block (e.g., ['KP', 'IR'])

  // ============ Notification Settings ============

  @Column({ type: 'boolean', default: true })
  notifyOnPolicyViolation: boolean; // Notify admins when member violates policy

  @Column({ type: 'boolean', default: true })
  notifyOnAccessDenied: boolean; // Notify admins when access is denied

  // ============ Metadata ============

  @Column({ nullable: true })
  updatedById: string; // User who last modified

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updatedById' })
  updatedBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
