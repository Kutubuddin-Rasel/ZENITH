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

  @Column({ type: 'date', nullable: true })
  releaseDate?: string; // when planned or done

  @Column({ default: false })
  isReleased: boolean;

  @OneToMany(() => IssueRelease, (ir) => ir.release, { cascade: true })
  issueLinks: IssueRelease[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
