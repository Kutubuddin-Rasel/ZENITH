// src/sprints/entities/sprint-issue.entity.ts
import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from 'typeorm';
import { Sprint } from './sprint.entity';
import { Issue } from '../../issues/entities/issue.entity';

@Entity({ name: 'sprint_issues' })
export class SprintIssue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sprintId: string;

  @ManyToOne(() => Sprint, (sprint) => sprint.issues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprintId' })
  sprint: Sprint;

  @Column()
  issueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;

  @Column({ type: 'int', default: 0 })
  sprintOrder: number; // position in sprint backlog
}
