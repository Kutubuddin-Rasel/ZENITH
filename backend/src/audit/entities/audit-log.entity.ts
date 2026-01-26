import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AuditEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET = 'password_reset',
  TWO_FA_ENABLED = 'two_fa_enabled',
  TWO_FA_DISABLED = 'two_fa_disabled',
  TWO_FA_VERIFICATION = 'two_fa_verification',
  SAML_LOGIN = 'saml_login',
  SAML_LOGOUT = 'saml_logout',

  // User Management Events
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_ACTIVATED = 'user_activated',
  USER_DEACTIVATED = 'user_deactivated',
  USER_ROLE_CHANGED = 'user_role_changed',

  // Project Management Events
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  PROJECT_ARCHIVED = 'project_archived',
  PROJECT_RESTORED = 'project_restored',

  // Issue Management Events
  ISSUE_CREATED = 'issue_created',
  ISSUE_UPDATED = 'issue_updated',
  ISSUE_DELETED = 'issue_deleted',
  ISSUE_ASSIGNED = 'issue_assigned',
  ISSUE_UNASSIGNED = 'issue_unassigned',
  ISSUE_STATUS_CHANGED = 'issue_status_changed',
  ISSUE_PRIORITY_CHANGED = 'issue_priority_changed',

  // Session Management Events
  SESSION_CREATED = 'session_created',
  SESSION_TERMINATED = 'session_terminated',
  SESSION_LOCKED = 'session_locked',
  SESSION_REFRESHED = 'session_refreshed',

  // Access Control Events
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  ACCESS_RULE_CREATED = 'access_rule_created',
  ACCESS_RULE_UPDATED = 'access_rule_updated',
  ACCESS_RULE_DELETED = 'access_rule_deleted',
  EMERGENCY_ACCESS_GRANTED = 'emergency_access_granted',

  // Sprint Management Events
  SPRINT_CREATED = 'sprint_created',
  SPRINT_UPDATED = 'sprint_updated',
  SPRINT_DELETED = 'sprint_deleted',
  SPRINT_STARTED = 'sprint_started',
  SPRINT_COMPLETED = 'sprint_completed',
  SPRINT_CANCELLED = 'sprint_cancelled',

  // Board Management Events
  BOARD_CREATED = 'board_created',
  BOARD_UPDATED = 'board_updated',
  BOARD_DELETED = 'board_deleted',
  COLUMN_CREATED = 'column_created',
  COLUMN_UPDATED = 'column_updated',
  COLUMN_DELETED = 'column_deleted',

  // File Management Events
  FILE_UPLOADED = 'file_uploaded',
  FILE_DOWNLOADED = 'file_downloaded',
  FILE_DELETED = 'file_deleted',
  FILE_SHARED = 'file_shared',

  // Permission Events
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REMOVED = 'role_removed',

  // System Events
  SYSTEM_STARTUP = 'system_startup',
  SYSTEM_SHUTDOWN = 'system_shutdown',
  CONFIGURATION_CHANGED = 'configuration_changed',
  BACKUP_CREATED = 'backup_created',
  BACKUP_RESTORED = 'backup_restored',

  // Security Events
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  DATA_EXPORT = 'data_export',
  DATA_IMPORT = 'data_import',

  // API Key Lifecycle Events (PCI-DSS Requirement 10)
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
  API_KEY_UPDATED = 'api_key_updated',
  API_KEY_ROTATED = 'api_key_rotated',
  API_KEY_VALIDATED = 'api_key_validated',
  API_KEY_VALIDATION_FAILED = 'api_key_validation_failed',
  API_KEY_EXPIRED = 'api_key_expired',
  API_KEY_IP_DENIED = 'api_key_ip_denied', // Blocked due to IP restriction
  CLEANUP_JOB_COMPLETED = 'cleanup_job_completed', // Background cleanup job
  CSRF_VALIDATION_FAILED = 'csrf_validation_failed', // CSRF attack or client bug

  // RBAC Events
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',

  // Encryption Events (NIST SP 800-57 Key Management Logging)
  DATA_ENCRYPTED = 'data_encrypted', // Low severity, high-value operations only
  DATA_DECRYPTED = 'data_decrypted', // Low severity, high-value operations only
  KEY_ROTATION_INITIATED = 'key_rotation_initiated', // High severity
  ENCRYPTION_FAILURE = 'encryption_failure', // High severity
  DECRYPTION_FAILURE = 'decryption_failure', // High severity
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AuditStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  WARNING = 'warning',
  INFO = 'info',
}

@Entity({ name: 'audit_logs' })
@Index('IDX_audit_log_user_id', ['userId'])
@Index('IDX_audit_log_event_type', ['eventType'])
@Index('IDX_audit_log_severity', ['severity'])
@Index('IDX_audit_log_timestamp', ['timestamp'])
@Index('IDX_audit_log_project_id', ['projectId'])
@Index('IDX_audit_log_resource_type', ['resourceType'])
@Index('IDX_audit_log_resource_id', ['resourceId'])
@Index('IDX_audit_log_recent', ['timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuditEventType })
  eventType: AuditEventType;

  @Column({ type: 'enum', enum: AuditSeverity, default: AuditSeverity.LOW })
  severity: AuditSeverity;

  @Column({ type: 'enum', enum: AuditStatus, default: AuditStatus.INFO })
  status: AuditStatus;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  details: string | null; // JSON string for additional data

  @Column({ type: 'text', nullable: true })
  oldValues: string | null; // JSON string for old values

  @Column({ type: 'text', nullable: true })
  newValues: string | null; // JSON string for new values

  // User Information
  @Column({ nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', nullable: true })
  userEmail: string | null; // Denormalized for performance

  @Column({ type: 'varchar', nullable: true })
  userName: string | null; // Denormalized for performance

  // Resource Information
  @Column({ type: 'varchar', nullable: true })
  resourceType: string | null; // e.g., 'user', 'project', 'issue'

  @Column({ type: 'varchar', nullable: true })
  resourceId: string | null; // ID of the affected resource

  @Column({ type: 'varchar', nullable: true })
  projectId: string | null; // Project context

  // Request Information
  @Column({ type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  requestId: string | null; // For tracing requests

  // Geographic Information
  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  // Timestamps
  @CreateDateColumn()
  timestamp: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date; // For log retention

  // Additional Metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ default: false })
  isRetained: boolean; // For compliance retention

  @Column({ default: false })
  isEncrypted: boolean; // For sensitive data

  @Column({ type: 'varchar', nullable: true })
  correlationId: string | null; // For related events
}
