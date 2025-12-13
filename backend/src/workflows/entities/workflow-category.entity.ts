// src/workflows/entities/workflow-category.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { WorkflowStatus } from './workflow-status.entity';

/**
 * WorkflowCategory represents the fixed, immutable meta-states for cross-project reporting.
 * These are system-defined categories that provide consistency across all projects.
 *
 * Examples: Backlog, Todo, In Progress, Done, Canceled
 */
@Entity({ name: 'workflow_categories' })
@Index('IDX_workflow_category_key', ['key'], { unique: true })
@Index('IDX_workflow_category_position', ['position'])
export class WorkflowCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string; // e.g., 'backlog', 'todo', 'in_progress', 'done', 'canceled'

  @Column()
  displayName: string; // e.g., 'Backlog', 'To Do', 'In Progress', 'Done', 'Canceled'

  @Column({ nullable: true })
  colorHex: string; // e.g., '#808080', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444'

  @Column({ type: 'int', default: 0 })
  position: number; // display order

  @Column({ default: true })
  isSystem: boolean; // true for built-in categories, false for user-created (future)

  @OneToMany(() => WorkflowStatus, (status) => status.category)
  statuses: WorkflowStatus[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
