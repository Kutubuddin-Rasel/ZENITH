import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  VersionColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

// Legacy enum - kept for reference but status is now a flexible string
export enum IssueStatus {
  BACKLOG = 'Backlog',
  TODO = 'To Do',
  SELECTED = 'Selected for Development',
  IN_PROGRESS = 'In Progress',
  IN_REVIEW = 'In Review',
  BLOCKED = 'Blocked',
  READY_FOR_QA = 'Ready for QA',
  TESTING = 'Testing',
  DONE = 'Done',
  CLOSED = 'Closed',
  REOPENED = 'Reopened',
  ON_HOLD = 'On Hold',
}

export enum IssuePriority {
  HIGHEST = 'Highest',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
  LOWEST = 'Lowest',
}

export enum IssueType {
  EPIC = 'Epic',
  STORY = 'Story',
  TASK = 'Task',
  BUG = 'Bug',
  SUBTASK = 'Sub-task',
}

@Entity({ name: 'issues' })
@Index('IDX_issue_project_id', ['projectId'])
@Index('IDX_issue_status', ['status'])
@Index('IDX_issue_priority', ['priority'])
@Index('IDX_issue_type', ['type'])
@Index('IDX_issue_assignee_id', ['assigneeId'])
@Index('IDX_issue_reporter_id', ['reporterId'])
@Index('IDX_issue_created_at', ['createdAt'])
@Index('IDX_issue_updated_at', ['updatedAt'])
@Index('IDX_issue_story_points', ['storyPoints'])
@Index('IDX_issue_project_status', ['projectId', 'status'])
@Index('IDX_issue_project_assignee', ['projectId', 'assigneeId'])
@Index('IDX_issue_project_priority', ['projectId', 'priority'])
@Index('IDX_issue_project_type', ['projectId', 'type'])
@Index('IDX_issue_active_project', ['projectId', 'status'])
@Index('IDX_issue_project_updated', ['projectId', 'updatedAt'])
@Index('IDX_issue_project_created', ['projectId', 'createdAt'])
@Index('IDX_issue_project_priority_created', [
  'projectId',
  'priority',
  'createdAt',
])
@Index('IDX_issue_project_number_unique', ['projectId', 'number'], {
  unique: true,
})
// @Index('IDX_issue_title_search', ['title'], { synchronize: false }) - GIN index manually managed
// @Index('IDX_issue_description_search', ['description'], { synchronize: false }) - GIN index manually managed
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', nullable: true })
  number: number | null;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ nullable: true })
  parentId?: string;

  @ManyToOne(() => Issue, (issue) => issue.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: Issue;

  @OneToMany(() => Issue, (issue) => issue.parent)
  children?: Issue[];

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // Linear-style: status is a simple string that matches board column names
  // Examples: "Backlog", "Design", "Development", "Testing", "Done"
  @Column({ default: 'Backlog' })
  status: string;

  @Column({ type: 'enum', enum: IssuePriority, default: IssuePriority.MEDIUM })
  priority: IssuePriority;

  @Column({ nullable: true })
  assigneeId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigneeId' })
  assignee?: User;

  @Column()
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporterId' })
  reporter: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'int', default: 0 })
  backlogOrder: number;

  @Column({ type: 'enum', enum: IssueType, default: IssueType.TASK })
  type: IssueType;

  @Column({ type: 'int', default: 0 })
  storyPoints: number;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  archivedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  @Index('IDX_issue_due_date')
  dueDate: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'simple-array', nullable: true })
  labels: string[];

  // Optimistic locking - auto-incremented on each update
  // Used to detect concurrent edits: if version doesn't match, another user edited first
  @VersionColumn()
  version: number;

  // Mapped to vector column. We use 'simple-array' or custom transformer ideally.
  // Using 'float' array might fail if format differs.
  // We'll treat it as 'simple-array' of numbers for read compat, or just 'any'.
  // But strictly, we update this via raw SQL usually.
  @Column('float', { array: true, nullable: true })
  embedding: number[];
}
