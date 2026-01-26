import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * History Action Types
 */
export enum HistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Access Rule History Entity
 *
 * Provides an immutable audit trail of all access rule changes
 * for SOC 2 and ISO 27001 compliance.
 *
 * DESIGN PRINCIPLES:
 * - Immutable: Records are never updated or deleted
 * - Schema-agnostic: JSONB snapshots handle future schema changes
 * - Transactional: History insert and rule change happen atomically
 *
 * USAGE:
 * - CREATE: previousState = null, newState = full rule object
 * - UPDATE: previousState = before, newState = after
 * - DELETE: previousState = final state, newState = null
 */
@Entity('access_rule_history')
@Index('IDX_access_rule_history_rule_id', ['ruleId'])
@Index('IDX_access_rule_history_actor_id', ['actorId'])
@Index('IDX_access_rule_history_action', ['action'])
@Index('IDX_access_rule_history_created_at', ['createdAt'])
@Index('IDX_access_rule_history_organization_id', ['organizationId'])
export class AccessRuleHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The action that was performed on the rule
   */
  @Column({
    type: 'enum',
    enum: HistoryAction,
  })
  action: HistoryAction;

  /**
   * The ID of the affected access rule.
   * Nullable because the rule may be deleted.
   */
  @Column({ type: 'uuid' })
  ruleId: string;

  /**
   * Organization ID for multi-tenant auditing.
   * Null = global rule history.
   */
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  /**
   * The user ID who performed the action.
   * Nullable for system-generated changes (e.g., expiry cleanup).
   */
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorId' })
  actor: User;

  /**
   * The state of the rule BEFORE the action.
   * - CREATE: null (rule didn't exist)
   * - UPDATE: full rule snapshot before changes
   * - DELETE: full rule snapshot before deletion
   */
  @Column({ type: 'jsonb', nullable: true })
  previousState: Record<string, unknown> | null;

  /**
   * The state of the rule AFTER the action.
   * - CREATE: full rule snapshot after creation
   * - UPDATE: full rule snapshot after changes
   * - DELETE: null (rule no longer exists)
   */
  @Column({ type: 'jsonb', nullable: true })
  newState: Record<string, unknown> | null;

  /**
   * Summary of what changed (for UPDATE actions).
   * Makes it easier to query "what fields were modified?"
   */
  @Column({ type: 'jsonb', nullable: true })
  changedFields: string[] | null;

  /**
   * Optional reason/comment for the change.
   * Useful for audit investigations.
   */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /**
   * IP address of the actor (for security forensics).
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  actorIpAddress: string | null;

  /**
   * User agent of the actor's client.
   */
  @Column({ type: 'text', nullable: true })
  actorUserAgent: string | null;

  /**
   * Timestamp when this history record was created.
   * This is the official "when did the change happen?" timestamp.
   */
  @CreateDateColumn()
  createdAt: Date;
}
