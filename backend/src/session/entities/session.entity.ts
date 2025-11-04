import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
  SUSPENDED = 'suspended',
}

export enum SessionType {
  WEB = 'web',
  MOBILE = 'mobile',
  API = 'api',
  DESKTOP = 'desktop',
}

@Entity('sessions')
@Index(['userId', 'status'])
@Index(['sessionId'])
@Index(['expiresAt'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sessionId: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.ACTIVE,
  })
  status: SessionStatus;

  @Column({
    type: 'enum',
    enum: SessionType,
    default: SessionType.WEB,
  })
  type: SessionType;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'timestamp' })
  lastActivity: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  terminatedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  terminatedBy: string | null; // User ID who terminated the session

  @Column({ type: 'varchar', nullable: true })
  terminationReason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ default: false })
  isConcurrent: boolean; // Whether this is a concurrent session

  @Column({ default: 0 })
  concurrentCount: number; // Number of concurrent sessions for this user

  @Column({ default: 0 })
  requestCount: number; // Number of requests made in this session

  @Column({ type: 'timestamp', nullable: true })
  lastRequestAt: Date | null;

  @Column({ default: false })
  isSecure: boolean; // Whether session is over HTTPS

  @Column({ default: false })
  isHttpOnly: boolean; // Whether session cookie is HTTP-only

  @Column({ default: false })
  isSameSite: boolean; // Whether session cookie is SameSite

  @Column({ type: 'varchar', nullable: true })
  deviceId: string | null; // Unique device identifier

  @Column({ type: 'varchar', nullable: true })
  deviceName: string | null; // Human-readable device name

  @Column({ type: 'varchar', nullable: true })
  osName: string | null; // Operating system name

  @Column({ type: 'varchar', nullable: true })
  osVersion: string | null; // Operating system version

  @Column({ type: 'varchar', nullable: true })
  browserName: string | null; // Browser name

  @Column({ type: 'varchar', nullable: true })
  browserVersion: string | null; // Browser version

  @Column({ default: false })
  isMobile: boolean; // Whether session is from mobile device

  @Column({ default: false })
  isTablet: boolean; // Whether session is from tablet device

  @Column({ default: false })
  isDesktop: boolean; // Whether session is from desktop device

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLogoutAt: Date | null;

  @Column({ default: false })
  isRememberMe: boolean; // Whether user chose "Remember Me"

  @Column({ type: 'timestamp', nullable: true })
  rememberUntil: Date | null; // When "Remember Me" expires

  @Column({ default: false })
  isTwoFactorVerified: boolean; // Whether 2FA was verified for this session

  @Column({ type: 'timestamp', nullable: true })
  twoFactorVerifiedAt: Date | null;

  @Column({ default: false })
  isSuspicious: boolean; // Whether session shows suspicious activity

  @Column({ type: 'jsonb', nullable: true })
  suspiciousActivity: Record<string, any> | null; // Details of suspicious activity

  @Column({ default: 0 })
  failedLoginAttempts: number; // Number of failed login attempts

  @Column({ type: 'timestamp', nullable: true })
  lastFailedLoginAt: Date | null;

  @Column({ default: false })
  isLocked: boolean; // Whether session is locked due to suspicious activity

  @Column({ type: 'timestamp', nullable: true })
  lockedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lockedBy: string | null; // User ID who locked the session

  @Column({ type: 'varchar', nullable: true })
  lockReason: string | null; // Reason for locking the session

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
