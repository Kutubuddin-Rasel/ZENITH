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

export enum AccessRuleType {
  WHITELIST = 'whitelist',
  BLACKLIST = 'blacklist',
  GEOGRAPHIC = 'geographic',
  TIME_BASED = 'time_based',
  USER_SPECIFIC = 'user_specific',
  ROLE_BASED = 'role_based',
}

export enum AccessRuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
}

export enum IPType {
  SINGLE = 'single',
  RANGE = 'range',
  CIDR = 'cidr',
  WILDCARD = 'wildcard',
}

@Entity('ip_access_rules')
@Index('IDX_ip_access_rule_rule_type', ['ruleType'])
@Index('IDX_ip_access_rule_status', ['status'])
@Index('IDX_ip_access_rule_ip_address', ['ipAddress'])
@Index('IDX_ip_access_rule_user_id', ['userId'])
@Index('IDX_ip_access_rule_priority', ['priority'])
@Index('IDX_ip_access_rule_is_active', ['isActive'])
export class IPAccessRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AccessRuleType,
  })
  ruleType: AccessRuleType;

  @Column({
    type: 'enum',
    enum: AccessRuleStatus,
    default: AccessRuleStatus.ACTIVE,
  })
  status: AccessRuleStatus;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar' })
  ipAddress: string; // Can be single IP, range, or CIDR

  @Column({
    type: 'enum',
    enum: IPType,
    default: IPType.SINGLE,
  })
  ipType: IPType;

  @Column({ type: 'varchar', nullable: true })
  endIpAddress: string | null; // For IP ranges

  @Column({ type: 'varchar', nullable: true })
  country: string | null; // Country code (ISO 3166-1 alpha-2)

  @Column({ type: 'varchar', nullable: true })
  region: string | null; // State/Province

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  timezone: string | null;

  @Column({ type: 'time', nullable: true })
  allowedStartTime: string | null; // HH:MM format

  @Column({ type: 'time', nullable: true })
  allowedEndTime: string | null; // HH:MM format

  @Column({ type: 'json', nullable: true })
  allowedDays: number[] | null; // Array of day numbers (0=Sunday, 6=Saturday)

  @Column({ nullable: true })
  userId: string | null; // For user-specific rules

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'json', nullable: true })
  allowedRoles: string[] | null; // Array of role names

  @Column({ type: 'json', nullable: true })
  allowedProjects: string[] | null; // Array of project IDs

  @Column({ type: 'timestamp', nullable: true })
  validFrom: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  validUntil: Date | null;

  @Column({ default: 0 })
  hitCount: number; // Number of times this rule was matched

  @Column({ type: 'timestamp', nullable: true })
  lastHitAt: Date | null;

  @Column({ default: false })
  isTemporary: boolean; // Whether this is a temporary rule

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null; // For temporary rules

  @Column({ default: false })
  isEmergency: boolean; // Emergency access rule

  @Column({ type: 'varchar', nullable: true })
  emergencyReason: string | null;

  @Column({ default: false })
  requiresApproval: boolean; // Whether access requires approval

  @Column({ type: 'varchar', nullable: true })
  approvedBy: string | null; // User ID who approved

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null; // User ID who created the rule

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ default: false })
  isActive: boolean; // Whether rule is currently active

  @Column({ default: false })
  isSystemRule: boolean; // Whether this is a system-generated rule

  @Column({ type: 'varchar', nullable: true })
  parentRuleId: string | null; // For rule inheritance

  @Column({ default: 0 })
  priority: number; // Rule priority (higher number = higher priority)

  @Column({ default: false })
  isLoggingEnabled: boolean; // Whether to log access attempts

  @Column({ default: false })
  isNotificationEnabled: boolean; // Whether to send notifications

  @Column({ type: 'json', nullable: true })
  notificationChannels: string[] | null; // Email, SMS, Slack, etc.

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
