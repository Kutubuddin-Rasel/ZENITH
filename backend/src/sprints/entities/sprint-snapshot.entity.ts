import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Sprint } from './sprint.entity';

@Entity({ name: 'sprint_snapshots' })
@Index('IDX_sprint_snapshot_sprint_date', ['sprintId', 'date'])
export class SprintSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sprintId: string;

  @ManyToOne(() => Sprint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sprintId' })
  sprint: Sprint;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  @Column({ type: 'int', default: 0 })
  totalPoints: number; // Scope (Committed + Added)

  @Column({ type: 'int', default: 0 })
  completedPoints: number; // Burned

  @Column({ type: 'int', default: 0 })
  remainingPoints: number; // To Burn

  @Column({ type: 'int', default: 0 })
  totalIssues: number;

  @Column({ type: 'int', default: 0 })
  completedIssues: number;

  @CreateDateColumn()
  createdAt: Date;
}
