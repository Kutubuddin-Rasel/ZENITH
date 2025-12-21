import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  // ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
// import { Organization } from '../../organizations/entities/organization.entity';
import { SyncLog } from './sync-log.entity';
import { ExternalData } from './external-data.entity';

export enum IntegrationType {
  SLACK = 'slack',
  GITHUB = 'github',
  JIRA = 'jira',
  GOOGLE_WORKSPACE = 'google_workspace',
  MICROSOFT_TEAMS = 'microsoft_teams',
  TRELLO = 'trello',
}

export enum IntegrationStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  ERROR = 'error',
  DISCONNECTED = 'disconnected',
  PENDING = 'pending',
}

export interface IntegrationConfig {
  webhookUrl?: string;
  channels?: string[];
  repositories?: string[];
  projects?: string[];
  calendarId?: string;
  driveFolderId?: string;
  teamId?: string;
  boards?: string[];
  syncSettings?: {
    enabled: boolean;
    frequency: 'realtime' | 'hourly' | 'daily';
    batchSize: number;
  };
  notifications?: {
    enabled: boolean;
    channels: string[];
    events: string[];
  };
}

export interface AuthConfig {
  type: 'oauth' | 'api_key' | 'webhook';
  accessToken?: string;
  refreshToken?: string;
  clientSecret?: string;
  apiKey?: string;
  webhookSecret?: string;
  expiresAt?: Date;
  scopes?: string[];
}

@Entity('integrations')
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: IntegrationType,
  })
  type: IntegrationType;

  @Column('jsonb')
  config: IntegrationConfig;

  @Column('jsonb')
  authConfig: AuthConfig;

  @Column()
  organizationId: string;

  // @ManyToOne(() => Organization)
  // organization: Organization;

  @Column({ default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    default: IntegrationStatus.HEALTHY,
  })
  healthStatus: IntegrationStatus;

  // ========================================
  // GitHub App Fields (Enterprise)
  // ========================================

  /**
   * GitHub App installation ID.
   * Used to generate installation access tokens.
   */
  @Column({ type: 'varchar', nullable: true })
  installationId: string | null;

  /**
   * Account type for GitHub App installation.
   * Either 'User' or 'Organization'.
   */
  @Column({ type: 'varchar', nullable: true })
  accountType: string | null;

  /**
   * Account login/name for GitHub App installation.
   * e.g., 'my-org' or 'my-username'.
   */
  @Column({ type: 'varchar', nullable: true })
  accountLogin: string | null;

  /**
   * Flag to identify legacy OAuth integrations.
   * These need to be migrated to GitHub App.
   */
  @Column({ type: 'boolean', default: false })
  isLegacyOAuth: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastErrorAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastErrorMessage: string | null;

  /**
   * @deprecated UNUSED - Tokens are stored in authConfig.accessToken (encrypted there).
   * TODO: Remove this column via a migration.
   */
  @Column({ type: 'text', nullable: true })
  encryptedAccessToken: string;

  /**
   * @deprecated UNUSED - Tokens are stored in authConfig.refreshToken (encrypted there).
   * TODO: Remove this column via a migration.
   */
  @Column({ type: 'text', nullable: true })
  encryptedRefreshToken: string;

  @OneToMany(() => SyncLog, (log) => log.integration)
  syncLogs: SyncLog[];

  @OneToMany(() => ExternalData, (data) => data.integration)
  externalData: ExternalData[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
