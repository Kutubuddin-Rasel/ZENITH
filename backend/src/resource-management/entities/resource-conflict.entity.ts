import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('resource_conflicts')
@Check("severity IN ('low', 'medium', 'high', 'critical')")
@Check("status IN ('active', 'resolved', 'ignored')")
export class ResourceConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column('date')
  conflictDate: Date;

  @Column('decimal', { precision: 5, scale: 2 })
  totalAllocationPercentage: number;

  @Column('jsonb')
  conflictingAllocations: Record<string, unknown>;

  @Column('varchar', { length: 20, default: 'medium' })
  severity: string; // low, medium, high, critical

  @Column('varchar', { length: 20, default: 'active' })
  status: string; // active, resolved, ignored

  @Column('timestamp', { nullable: true })
  resolvedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  resolvedBy: User;

  @Column('text', { nullable: true })
  resolutionNotes: string;

  @Column('boolean', { default: false })
  autoResolutionAttempted: boolean;

  @CreateDateColumn()
  detectedAt: Date;

  // @Index(['user', 'conflictDate', 'status'])
}
