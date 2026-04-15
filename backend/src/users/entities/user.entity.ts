import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity({ name: 'users' })
@Index('IDX_user_email', ['email'])
@Index('IDX_user_is_active', ['isActive'])
@Index('IDX_user_is_super_admin', ['isSuperAdmin'])
@Index('IDX_user_email_verification_token', ['emailVerificationToken'])
// @Index('IDX_user_name_search') // Requires pg_trgm
// @Index('IDX_user_email_search') // Requires pg_trgm
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  name: string;

  @Column({ default: false })
  isSuperAdmin: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  defaultRole: string; // e.g. 'Developer', 'QA', etc.

  @Column({ default: false })
  mustChangePassword: boolean; // Force password change on first login

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  hashedRefreshToken?: string | null;

  // Password hashing version for lazy migration
  // 1 = bcrypt 10 rounds (legacy), 2 = bcrypt 12, 3 = argon2id
  @Column({ default: 1 })
  passwordVersion: number;

  // ---------------------------------------------------------------------------
  // Email Verification (OWASP Identity Verification)
  // ---------------------------------------------------------------------------

  /** Whether the user has verified their email address */
  @Column({ default: false })
  emailVerified: boolean;

  /**
   * Cryptographic token for email verification (crypto.randomBytes(32).hex).
   * select: false — never exposed in normal queries (same pattern as hashedRefreshToken).
   */
  @Column({ type: 'varchar', nullable: true, select: false })
  emailVerificationToken: string | null;

  /**
   * Token expiry (OWASP recommends 24h max for email verification tokens).
   * Null when no pending verification.
   */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiry: Date | null;

  // ---------------------------------------------------------------------------
  // Organization relationship
  // ---------------------------------------------------------------------------

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization;
}
