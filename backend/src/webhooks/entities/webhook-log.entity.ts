import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Webhook } from './webhook.entity';

@Entity('webhook_logs')
export class WebhookLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  webhookId: string;

  @ManyToOne(() => Webhook, (webhook) => webhook.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhookId' })
  webhook: Webhook;

  @Column()
  event: string;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({ nullable: true })
  responseStatus?: number;

  @Column({ type: 'text', nullable: true })
  responseBody?: string;

  @Column({ nullable: true })
  deliveryDuration?: number; // in milliseconds

  @Column({ default: false })
  success: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
