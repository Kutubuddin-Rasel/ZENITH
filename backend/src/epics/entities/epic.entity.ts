// src/epics/entities/epic.entity.ts
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
import { Story } from './story.entity';

export enum EpicStatus {
  PLANNED = 'Planned',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
}

@Entity({ name: 'epics' })
export class Epic {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() projectId: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ type: 'enum', enum: EpicStatus, default: EpicStatus.PLANNED })
  status: EpicStatus;
  @Column({ type: 'date', nullable: true }) startDate?: string;
  @Column({ type: 'date', nullable: true }) endDate?: string;

  @OneToMany(() => Story, (s) => s.epic, { cascade: true })
  stories: Story[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
