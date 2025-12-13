import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Issue } from './issue.entity';

export enum LinkType {
  BLOCKS = 'BLOCKS', // Source blocks Target
  IS_BLOCKED_BY = 'IS_BLOCKED_BY', // Source is blocked by Target (inverse of BLOCKS)
  RELATES_TO = 'RELATES_TO', // Bidirectional
  DUPLICATES = 'DUPLICATES', // Source duplicates Target
}

@Entity({ name: 'issue_links' })
@Index('IDX_issue_link_source', ['sourceIssueId'])
@Index('IDX_issue_link_target', ['targetIssueId'])
export class IssueLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceIssueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceIssueId' })
  sourceIssue: Issue;

  @Column()
  targetIssueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetIssueId' })
  targetIssue: Issue;

  @Column({
    type: 'enum',
    enum: LinkType,
    default: LinkType.RELATES_TO,
  })
  type: LinkType;

  @CreateDateColumn()
  createdAt: Date;
}
