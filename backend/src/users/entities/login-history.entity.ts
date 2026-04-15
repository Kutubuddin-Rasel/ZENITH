/**
 * LoginHistory Entity — User Login Attempt Tracking
 *
 * PURPOSE:
 * Records every login attempt (success and failure) for:
 * - Security auditing ("was this you?" notifications)
 * - Suspicious login detection (new device/location)
 * - Compliance (SOC2/ISO27001 access logging)
 *
 * DESIGN DECISIONS:
 *
 * 1. SEPARATE TABLE (not in User entity):
 *    Login history is append-only, high-volume data. Embedding it in User
 *    would bloat every User query. Separate table = clean reads.
 *
 * 2. ipAddress: varchar(45) — covers IPv6 max length (e.g., "::ffff:192.168.1.1")
 *
 * 3. deviceFingerprint: Optional SHA-256 hash of device metadata.
 *    Frontend computes this from canvas/WebGL/audio hashing.
 *    Backend just stores the opaque hash.
 *
 * 4. failureReason: Enum-like varchar for queryability.
 *    Possible values: 'invalid_password', 'account_locked', 'user_not_found',
 *    'account_inactive', '2fa_failed'. NULL for successful logins.
 *
 * 5. THREE INDEXES for different query patterns:
 *    - userId: Basic user lookup
 *    - (userId, timestamp DESC): Paginated history for "my login history"
 *    - (organizationId, timestamp DESC): Admin security dashboard
 *
 * @see LoginHistoryService for the recording logic
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Strongly typed failure reasons — prevents stringly-typed bugs.
 * NULL means successful login.
 */
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

  /** FK to users table — the user who attempted login */
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** IPv4 or IPv6 address of the client. Max 45 chars covers IPv6. */
  @Column({ type: 'varchar', length: 45 })
  ipAddress: string;

  /** Raw User-Agent header. Nullable (not always available). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  /**
   * Client-computed device fingerprint (SHA-256 hash).
   * Opaque to the backend — we just store and compare.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceFingerprint: string | null;

  /** When the login attempt occurred */
  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  /** Whether the login attempt succeeded */
  @Column({ type: 'boolean' })
  success: boolean;

  /**
   * Why the login failed. NULL for successful logins.
   * Stored as varchar (not enum) for forward-compatibility — no migration
   * needed when we add new failure reasons.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: LoginFailureReason | null;

  /** Tenant ID for organization-scoped security dashboards */
  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;
}
