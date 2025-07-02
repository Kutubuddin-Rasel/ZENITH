// src/taxonomy/entities/label.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { IssueLabel } from './issue-label.entity';

@Entity({ name: 'labels' })
export class Label {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ unique: true })
  name: string; // e.g. "frontend"

  @OneToMany(() => IssueLabel, (il) => il.label, { cascade: true })
  issueLinks: IssueLabel[];
}
