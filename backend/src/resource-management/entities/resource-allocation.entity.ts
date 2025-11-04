import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
// import { Task } from '../../tasks/entities/task.entity';
import { UserCapacity } from './user-capacity.entity';

@Entity('resource_allocations')
@Check('allocation_percentage > 0 AND allocation_percentage <= 100')
@Check('start_date <= end_date')
export class ResourceAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  // @ManyToOne(() => Task, { nullable: true, onDelete: 'SET NULL' })
  // task: Task;

  @Column('decimal', { precision: 5, scale: 2 })
  allocationPercentage: number;

  @Column('date')
  startDate: Date;

  @Column('date')
  endDate: Date;

  @Column('decimal', { precision: 4, scale: 2, nullable: true })
  hoursPerDay: number;

  @Column('varchar', { length: 100 })
  roleInProject: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  billingRate: number;

  @Column('jsonb', { nullable: true })
  skillRequirements: Record<string, unknown>;

  @Column('decimal', { precision: 3, scale: 2, default: 1.0 })
  allocationConfidence: number;

  @ManyToOne(() => UserCapacity, { nullable: true })
  userCapacity: UserCapacity;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  // @Index(['user', 'startDate', 'endDate'])
  // @Index(['project', 'startDate', 'endDate'])
}
