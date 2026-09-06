import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';

/**
 * Step 4 — Notification-preference slice of the legacy `UserSecuritySettings`
 * aggregate. Maps the same `user_security_settings` row as `SessionPolicy`,
 * exposing only the email opt-in flags. UsersModule owns this read model
 * because notification preferences are part of the user's profile, not the
 * auth subsystem.
 */
@Entity({ name: 'user_security_settings' })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'boolean', default: true })
  notifyOnNewLogin: boolean;

  @Column({ type: 'boolean', default: true })
  notifyOnPasswordChange: boolean;

  @Column({ type: 'boolean', default: true })
  notifyOnSecurityEvent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
