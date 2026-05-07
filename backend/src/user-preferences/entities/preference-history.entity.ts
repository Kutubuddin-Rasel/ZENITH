import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type PreferenceJsonScalar = string | number | boolean | null;
export type PreferenceJsonValue =
  | PreferenceJsonScalar
  | PreferenceJsonValue[]
  | { [key: string]: PreferenceJsonValue };

@Entity({ name: 'preference_history' })
@Index(['userId', 'changedAt'])
export class PreferenceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  fieldPath: string;

  @Column({ type: 'jsonb', nullable: true })
  oldValue: PreferenceJsonValue;

  @Column({ type: 'jsonb', nullable: true })
  newValue: PreferenceJsonValue;

  @CreateDateColumn()
  changedAt: Date;
}
