import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../../../users/entities/user.entity';

export type LoginFailureReason =
  | 'invalid_password'
  | 'account_locked'
  | 'user_not_found'
  | 'account_inactive'
  | '2fa_failed';

@Entity({ name: 'login_history' })
@Index('IDX_login_history_user_id', ['userId'])
@Index('IDX_login_history_user_timestamp', ['userId', 'timestamp'])
@Index('IDX_login_history_org_timestamp', ['organizationId', 'timestamp'])
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 45 })
  ipAddress: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceFingerprint: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: LoginFailureReason | null;

  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;
}
