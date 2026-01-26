import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  keyHash: string; // Hashed version of the key

  @Column()
  keyPrefix: string; // First 8 characters for display (e.g., "zth_live_")

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  projectId?: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project?: Project;

  @Column({ type: 'jsonb', default: '[]' })
  scopes: string[]; // e.g., ["issues:read", "issues:write"]

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  /**
   * Rate limit for this API key (requests per minute).
   *
   * Default: 100 requests/minute
   * Premium keys: Up to 1000 requests/minute (admin override)
   *
   * Used by ApiKeyGuard for Fixed Window Counter rate limiting.
   */
  @Column({ type: 'integer', default: 100 })
  rateLimit: number;

  /**
   * IP allowlist for this API key.
   *
   * Supports:
   * - Single IPs: "192.168.1.100"
   * - CIDR ranges: "10.0.0.0/24"
   * - IPv6: "2001:db8::/32"
   *
   * SECURITY:
   * - null or []: No restrictions (allow all IPs) - default for backward compat
   * - ["192.168.1.0/24"]: Only allow from this range
   *
   * If a key is stolen but bound to a specific IP/range, it's useless to the attacker.
   */
  @Column({ type: 'jsonb', nullable: true, default: null })
  allowedIps: string[] | null;

  /**
   * Scheduled revocation timestamp (for key rotation).
   *
   * When a key is rotated:
   * 1. New key is created with identical settings
   * 2. Old key's revokeAt is set to NOW + grace period (default 24h)
   * 3. After revokeAt, the key is treated as invalid
   *
   * IMPORTANT: Guard MUST check this field in validateKey()!
   *
   * null = Not scheduled for revocation (normal active key)
   */
  @Column({ type: 'timestamp', nullable: true })
  revokeAt?: Date;

  /**
   * Reference to the key that replaced this one (for rotation tracking).
   * null = This is the current/latest key
   */
  @Column({ type: 'uuid', nullable: true })
  rotatedToKeyId?: string;

  /**
   * Timestamp when user was notified about this key being unused.
   *
   * Used by cleanup job to:
   * 1. Avoid sending duplicate notifications
   * 2. Implement daily email caps
   *
   * null = Not notified yet
   */
  @Column({ type: 'timestamp', nullable: true })
  unusedNotifiedAt?: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
