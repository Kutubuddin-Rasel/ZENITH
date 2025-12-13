// src/sprints/entities/sprint.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { SprintIssue } from './sprint-issue.entity';

export enum SprintStatus {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'sprints' })
@Index('IDX_sprint_project_id', ['projectId'])
@Index('IDX_sprint_status', ['status'])
@Index('IDX_sprint_is_active', ['isActive'])
@Index('IDX_sprint_start_date', ['startDate'])
@Index('IDX_sprint_end_date', ['endDate'])
@Index('IDX_sprint_active_project', ['projectId', 'status'])
export class Sprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  name: string;

  @Column({ type: 'date' })
  startDate: string; // YYYY-MM-DD

  @Column({ type: 'date' })
  endDate: string;

  @Column({
    type: 'enum',
    enum: SprintStatus,
    default: SprintStatus.PLANNED,
  })
  status: SprintStatus;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => SprintIssue, (si) => si.sprint, { cascade: true })
  issues: SprintIssue[];

  @Column({ type: 'text', nullable: true })
  goal?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
