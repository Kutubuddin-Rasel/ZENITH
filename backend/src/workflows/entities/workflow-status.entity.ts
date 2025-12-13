// src/workflows/entities/workflow-status.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { WorkflowCategory } from './workflow-category.entity';

/**
 * WorkflowStatus represents project-specific statuses that inherit from a WorkflowCategory.
 * These are flexible, user-defined statuses (e.g., "Design", "Code Review", "Testing")
 * that map to a parent category for reporting purposes.
 *
 * Key constraint: Each project has its own set of statuses with unique names.
 */
@Entity({ name: 'workflow_statuses' })
@Index('IDX_workflow_status_project_id', ['projectId'])
@Index('IDX_workflow_status_category_id', ['categoryId'])
@Index('IDX_workflow_status_position', ['projectId', 'position'])
@Unique('UQ_workflow_status_project_name', ['projectId', 'name']) // Status names unique per project
export class WorkflowStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  categoryId: string;

  @ManyToOne(() => WorkflowCategory, (category) => category.statuses, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categoryId' })
  category: WorkflowCategory;

  @Column()
  name: string; // e.g., "Design", "Development", "Code Review"

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  colorHex: string; // Optional override of category color

  @Column({ type: 'int', default: 0 })
  position: number; // display order within the project

  @Column({ default: false })
  isDefault: boolean; // true if this is the default status for new issues

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
