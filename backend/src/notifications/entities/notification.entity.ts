// src/notifications/entities/notification.entity.ts
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

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum NotificationStatus {
  UNREAD = 'unread',
  DONE = 'done',
  SAVED = 'saved',
  SNOOZED = 'snoozed',
  ARCHIVED = 'archived',
}

/**
 * SECURITY (Phase 5): Delivery confirmation status
 * Tracks WebSocket delivery for at-least-once semantics
 */
export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

@Entity({ name: 'notifications' })
@Index('IDX_notification_user_read', ['userId', 'read']) // OPTIMIZED: Frequent query pattern
@Index('IDX_notification_created_at', ['createdAt']) // OPTIMIZED: Ordering
@Index('IDX_notification_user_created', ['userId', 'createdAt']) // OPTIMIZED: User notifications with ordering
@Index('IDX_notification_user_org', ['userId', 'organizationId']) // OPTIMIZED (Phase 6): Multi-tenant scoping
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * SECURITY (Phase 6): Multi-tenant scoping
   * - Nullable for backwards compatibility with existing notifications
   * - Required when creating new notifications for tenant isolation
   * - Indexed for efficient org-scoped queries
   */
  @Column({ type: 'uuid', nullable: true })
  @Index('IDX_notification_org')
  organizationId?: string;

  @Column('text') message: string;

  @Column({ type: 'jsonb', nullable: true })
  context?: any; // e.g. { projectId, issueId }

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.INFO,
  })
  type: NotificationType;

  @Column({ default: false })
  read: boolean; // @deprecated Use status instead

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.UNREAD,
  })
  status: NotificationStatus;

  /**
   * SECURITY (Phase 5): WebSocket delivery confirmation
   * - PENDING: Not yet delivered
   * - DELIVERED: Client ACK received
   * - FAILED: Timeout or error (triggers fallback)
   */
  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  deliveryStatus: DeliveryStatus;

  @Column({ type: 'timestamp', nullable: true })
  snoozedUntil?: Date;

  @CreateDateColumn() createdAt: Date;
}
