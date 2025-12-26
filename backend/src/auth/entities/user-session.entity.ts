import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * UserSession Entity
 * Tracks active refresh token sessions for multi-device support
 * Allows users to view and manage their active sessions
 */
@Entity({ name: 'user_sessions' })
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Hashed refresh token (never exposed)
  @Column({ type: 'text' })
  tokenHash: string;

  // Device identification
  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceType: string | null; // 'desktop', 'mobile', 'tablet', 'unknown'

  @Column({ type: 'varchar', length: 100, nullable: true })
  browser: string | null; // 'Chrome', 'Firefox', 'Safari', etc.

  @Column({ type: 'varchar', length: 100, nullable: true })
  os: string | null; // 'Windows 11', 'macOS', 'iOS', etc.

  // Location/Network
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string | null; // 'New York, US' (from IP geolocation if available)

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  // Is this the current session making the request?
  // (Not stored in DB, computed at runtime)
  isCurrent?: boolean;
}
