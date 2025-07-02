// src/taxonomy/entities/issue-label.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Label } from './label.entity';
import { Issue } from '../../issues/entities/issue.entity';

@Entity({ name: 'issue_labels' })
export class IssueLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  labelId: string;
  @ManyToOne(() => Label, (lbl) => lbl.issueLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labelId' })
  label: Label;

  @Column()
  issueId: string;
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;
}
