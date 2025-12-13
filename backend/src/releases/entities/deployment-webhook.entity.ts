// src/releases/entities/deployment-webhook.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

export enum WebhookProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  JENKINS = 'jenkins',
  VERCEL = 'vercel',
  NETLIFY = 'netlify',
  AWS_CODEPIPELINE = 'aws_codepipeline',
  CUSTOM = 'custom',
}

@Entity({ name: 'deployment_webhooks' })
export class DeploymentWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  name: string; // e.g. "Production Deploy"

  @Column()
  webhookUrl: string; // The URL to trigger

  @Column({
    type: 'enum',
    enum: WebhookProvider,
    default: WebhookProvider.CUSTOM,
  })
  provider: WebhookProvider;

  @Column({ type: 'jsonb', nullable: true })
  headers?: Record<string, string>; // Custom headers (e.g., auth tokens)

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>; // Custom payload template

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastTriggeredAt?: Date;

  @Column({ nullable: true })
  lastStatus?: string; // 'success' | 'failed' | 'pending'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
