// src/releases/entities/issue-release.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Release } from './release.entity';
import { Issue } from '../../issues/entities/issue.entity';

@Entity({ name: 'issue_releases' })
export class IssueRelease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  releaseId: string;

  @ManyToOne(() => Release, (rel) => rel.issueLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'releaseId' })
  release: Release;

  @Column()
  issueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;
}
