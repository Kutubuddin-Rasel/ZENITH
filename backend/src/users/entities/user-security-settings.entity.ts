import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * UserSecuritySettings Entity
 * Stores user-specific security preferences (session settings, notifications)
 *
 * Relation: One-to-One with User
 * Note: 2FA is stored in TwoFactorAuth entity, not here
 */
@Entity({ name: 'user_security_settings' })
export class UserSecuritySettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Session Preferences
  @Column({ type: 'int', default: 30 })
  sessionTimeoutMinutes: number; // Range: 5-1440

  @Column({ type: 'int', default: 5 })
  maxConcurrentSessions: number; // Range: 1-20

  @Column({ type: 'boolean', default: true })
  killOldestOnLimit: boolean; // When limit reached, kill oldest session

  // Notification Preferences
  @Column({ type: 'boolean', default: true })
  notifyOnNewLogin: boolean; // Email on new device login

  @Column({ type: 'boolean', default: true })
  notifyOnPasswordChange: boolean; // Email on password change

  @Column({ type: 'boolean', default: true })
  notifyOnSecurityEvent: boolean; // Email on security events

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
