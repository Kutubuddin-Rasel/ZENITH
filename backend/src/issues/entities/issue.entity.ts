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
// Composite index for Kanban board queries: WHERE projectId=? AND isArchived=false ORDER BY backlogOrder
@Index('IDX_issue_project_board', ['projectId', 'isArchived', 'backlogOrder'])
// Relational status index: WHERE statusId=? (single column)
@Index('IDX_issue_status_id', ['statusId'])
// Composite for Kanban column filtering: WHERE projectId=? AND statusId=?
@Index('IDX_issue_project_statusid', ['projectId', 'statusId'])
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

  // Linked Workflow Status (Source of Truth)
  @Column({ type: 'uuid', nullable: true }) // Nullable for migration
  statusId: string;

  @ManyToOne('WorkflowStatus', { onDelete: 'SET NULL' }) // Lazy load to avoid circular deps if needed
  @JoinColumn({ name: 'statusId' })
  workflowStatus?: any; // Type as 'WorkflowStatus' but safely

  // Legacy string status - kept for read compatibility
  // In future, this should be a getter that returns workflowStatus.name
  @Column({ default: 'Backlog' })
  status: string;

  @Column({ type: 'enum', enum: IssuePriority, default: IssuePriority.MEDIUM })
  priority: IssuePriority;

  @Column({ nullable: true })
  assigneeId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigneeId' })
  assignee?: User;

  // Reporter - nullable to preserve issues when user is deleted
  @Column({ nullable: true })
  reporterId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporterId' })
  reporter: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'int', default: 0 })
  backlogOrder: number;

  // Lexorank string for O(1) reordering (used by Jira/Trello pattern)
  // Format: "0|aaaaaa:" - enables insertion between any two items with 1 UPDATE
  @Column({ type: 'varchar', length: 50, nullable: true, default: '0|HZZZZZ:' })
  @Index('IDX_issue_lexorank')
  lexorank: string;

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

  // PostgreSQL full-text search vector (auto-updated via database trigger)
  // DO NOT set this manually - the database trigger handles it
  // select: false excludes from default queries (it's only used for search)
  @Column({ type: 'tsvector', nullable: true, select: false })
  searchVector?: string;
}
