// src/watchers/entities/watcher.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { WatchPreference } from '../enums/watch-preference.enum';

@Entity({ name: 'watchers' })
@Index('IDX_watcher_user_project', ['userId', 'projectId'])
@Index('IDX_watcher_user_issue', ['userId', 'issueId'])
export class Watcher {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index('IDX_watcher_project')
  @Column({ nullable: true })
  projectId?: string;
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project?: Project;

  @Index('IDX_watcher_issue')
  @Column({ nullable: true })
  issueId?: string;
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue?: Issue;

  @Column({
    type: 'enum',
    enum: WatchPreference,
    default: WatchPreference.ALL,
  })
  preference: WatchPreference;

  @CreateDateColumn() createdAt: Date;
}
