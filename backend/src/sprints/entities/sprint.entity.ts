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
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { SprintIssue } from './sprint-issue.entity';

export enum SprintStatus {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

@Entity({ name: 'sprints' })
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
    default: SprintStatus.PLANNED 
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
