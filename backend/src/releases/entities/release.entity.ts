// src/releases/entities/release.entity.ts
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
import { IssueRelease } from './issue-release.entity';

export enum ReleaseStatus {
  UPCOMING = 'upcoming',
  RELEASED = 'released',
  ARCHIVED = 'archived',
}

export enum GitProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  AZURE = 'azure',
  CUSTOM = 'custom',
}

@Entity({ name: 'releases' })
export class Release {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  name: string; // e.g. "v1.0.0"

  @Column({ type: 'text', nullable: true })
  description?: string; // Release description/notes

  @Column({ type: 'date', nullable: true })
  releaseDate?: string; // when planned or done

  @Column({
    type: 'enum',
    enum: ReleaseStatus,
    default: ReleaseStatus.UPCOMING,
  })
  status: ReleaseStatus;

  @Column({ default: false })
  isReleased: boolean; // Deprecated: kept for backward compatibility

  // ==================== Git Integration ====================

  @Column({ nullable: true })
  gitTagName?: string; // e.g. "v1.0.0"

  @Column({ nullable: true })
  gitBranch?: string; // e.g. "release/v1.0.0"

  @Column({ nullable: true })
  commitSha?: string; // Full commit SHA

  @Column({
    type: 'enum',
    enum: GitProvider,
    nullable: true,
  })
  gitProvider?: GitProvider;

  @Column({ nullable: true })
  gitRepoUrl?: string; // e.g. "https://github.com/owner/repo"

  // ==================== Rollback Tracking ====================

  @Column({ nullable: true })
  rollbackFromId?: string; // ID of the release this was rolled back from

  @Column({ default: false })
  isRollback: boolean; // True if this release is a rollback from another

  // ==================== Relationships ====================

  @OneToMany(() => IssueRelease, (ir) => ir.release, { cascade: true })
  issueLinks: IssueRelease[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
