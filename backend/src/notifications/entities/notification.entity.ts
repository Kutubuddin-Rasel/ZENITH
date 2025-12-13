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
}

@Entity({ name: 'notifications' })
@Index('IDX_notification_user_read', ['userId', 'read']) // OPTIMIZED: Frequent query pattern
@Index('IDX_notification_created_at', ['createdAt']) // OPTIMIZED: Ordering
@Index('IDX_notification_user_created', ['userId', 'createdAt']) // OPTIMIZED: User notifications with ordering
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column() userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

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

  @CreateDateColumn() createdAt: Date;
}
