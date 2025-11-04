import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ResourceAllocation } from './resource-allocation.entity';

@Entity('user_capacity')
@Index(['user', 'date'], { unique: true })
export class UserCapacity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column('date')
  date: Date;

  @Column('decimal', { precision: 4, scale: 2, default: 8.0 })
  availableHours: number;

  @Column('decimal', { precision: 4, scale: 2, default: 0 })
  allocatedHours: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  capacityPercentage: number;

  @Column({ default: true })
  isWorkingDay: boolean;

  @Column('text', { nullable: true })
  notes: string;

  @OneToMany(() => ResourceAllocation, (allocation) => allocation.userCapacity)
  allocations: ResourceAllocation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
