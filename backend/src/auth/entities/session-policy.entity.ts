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
 * Step 4 — Session-policy slice of the legacy `UserSecuritySettings` aggregate.
 *
 * Physically backed by the existing `user_security_settings` table; only the
 * session-enforcement columns are projected here. The notification-preference
 * read model in `users/entities/notification-preference.entity.ts` maps the
 * same row from a different angle. No migration is required — the database
 * schema is unchanged.
 */
@Entity({ name: 'user_security_settings' })
export class SessionPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int', default: 30 })
  sessionTimeoutMinutes: number;

  @Column({ type: 'int', default: 5 })
  maxConcurrentSessions: number;

  @Column({ type: 'boolean', default: true })
  killOldestOnLimit: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
