import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

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
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ nullable: true })
  parentId?: string;

  @ManyToOne(() => Issue, (issue) => issue.children, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent?: Issue;

  @OneToMany(() => Issue, (issue) => issue.parent)
  children?: Issue[];

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: IssueStatus, default: IssueStatus.TODO })
  status: IssueStatus;

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
}
