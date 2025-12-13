// src/workflows/entities/workflow-transition.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { WorkflowStatus } from './workflow-status.entity';

/**
 * WorkflowTransition defines allowed status transitions for a project.
 * This enables state machine enforcement - restricting which statuses
 * can transition to which other statuses, and who can perform them.
 *
 * Examples:
 * - "Back to Development" → from "In Review" to "In Progress" (any role)
 * - "Mark as Done" → from any to "Done" (QA or PROJECT_LEAD only)
 * - "Approve" → from "Pending Review" to "Approved" (PROJECT_LEAD only)
 */
@Entity({ name: 'workflow_transitions' })
@Index('IDX_workflow_transition_project', ['projectId'])
@Index('IDX_workflow_transition_from', ['fromStatusId'])
@Index('IDX_workflow_transition_to', ['toStatusId'])
@Index('IDX_workflow_transition_active', ['projectId', 'isActive'])
export class WorkflowTransition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  /**
   * Source status for this transition.
   * NULL means "from any status" (wildcard).
   */
  @Column({ nullable: true })
  fromStatusId: string | null;

  @ManyToOne(() => WorkflowStatus, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'fromStatusId' })
  fromStatus: WorkflowStatus | null;

  /**
   * Target status for this transition.
   * Required - this is the status the issue will move to.
   */
  @Column()
  toStatusId: string;

  @ManyToOne(() => WorkflowStatus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toStatusId' })
  toStatus: WorkflowStatus;

  /**
   * Human-readable name for this transition.
   * Shown in UI (e.g., "Submit for Review", "Reopen Issue").
   */
  @Column()
  name: string;

  /**
   * Optional description of what this transition means.
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Roles allowed to perform this transition.
   * NULL or empty means all roles can perform it.
   * Example: ['PROJECT_LEAD', 'QA']
   */
  @Column({ type: 'simple-array', nullable: true })
  allowedRoles: string[] | null;

  /**
   * Additional conditions that must be met for this transition.
   */
  @Column({ type: 'jsonb', nullable: true })
  conditions: {
    /** Fields that must be populated before transition */
    requiredFields?: string[];
    /** Issue cannot have blocking issues */
    noBlockers?: boolean;
    /** Must add a comment explaining the transition */
    requireComment?: boolean;
    /** Must have at least this many story points estimated */
    minStoryPoints?: number;
  } | null;

  /**
   * Whether this transition is currently active.
   * Allows soft-disabling without deleting.
   */
  @Column({ default: true })
  isActive: boolean;

  /**
   * Position for ordering transitions in UI dropdowns.
   */
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
