import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Integration } from './integration.entity';

export enum SyncOperation {
  FULL_SYNC = 'full_sync',
  INCREMENTAL_SYNC = 'incremental_sync',
  WEBHOOK_SYNC = 'webhook_sync',
  MANUAL_SYNC = 'manual_sync',
  TEST_CONNECTION = 'test_connection',
}

export enum SyncStatus {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

export interface SyncDetails {
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsDeleted: number;
  errorsCount: number;
  errors: Array<{
    message: string;
    recordId?: string;
    timestamp: Date;
  }>;
  duration: number;
  metadata: Record<string, unknown>;
}

@Entity('integration_sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  integrationId: string;

  @ManyToOne(() => Integration, (integration) => integration.syncLogs)
  integration: Integration;

  @Column({
    type: 'enum',
    enum: SyncOperation,
  })
  operation: SyncOperation;

  @Column({
    type: 'enum',
    enum: SyncStatus,
  })
  status: SyncStatus;

  @Column('jsonb')
  details: SyncDetails;

  @Column()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
