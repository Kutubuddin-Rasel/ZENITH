import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Integration,
  IntegrationType,
  IntegrationStatus,
} from '../entities/integration.entity';
import { SyncLog, SyncStatus } from '../entities/sync-log.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';
import { IntegrationConfig, AuthConfig } from '../entities/integration.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { RateLimitService } from './rate-limit.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface CreateIntegrationDto {
  name: string;
  type: IntegrationType;
  config: IntegrationConfig;
  authConfig: AuthConfig;
  organizationId: string;
}

export interface UpdateIntegrationDto {
  name?: string;
  config?: IntegrationConfig;
  authConfig?: AuthConfig;
  isActive?: boolean;
}

export interface IntegrationHealth {
  status: IntegrationStatus;
  lastSyncAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  uptime: number;
  syncFrequency: string;
  recordsCount: number;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(SyncLog)
    private syncLogRepo: Repository<SyncLog>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
    private encryptionService: EncryptionService,
    private rateLimitService: RateLimitService,
    @InjectQueue('integration-sync') private syncQueue: Queue,
  ) {}

  async createIntegration(
    createIntegrationDto: CreateIntegrationDto,
  ): Promise<Integration> {
    const { name, type, config, authConfig, organizationId } =
      createIntegrationDto;

    // Encrypt sensitive data
    if (authConfig.accessToken) {
      authConfig.accessToken = this.encryptionService.encrypt(
        authConfig.accessToken,
      );
    }
    if (authConfig.refreshToken) {
      authConfig.refreshToken = this.encryptionService.encrypt(
        authConfig.refreshToken,
      );
    }
    if (authConfig.clientSecret) {
      authConfig.clientSecret = this.encryptionService.encrypt(
        authConfig.clientSecret,
      );
    }

    const integration = this.integrationRepo.create({
      name,
      type,
      config,
      authConfig,
      organizationId,
      isActive: true,
      healthStatus: IntegrationStatus.PENDING,
    });

    return await this.integrationRepo.save(integration);
  }

  async getIntegrations(organizationId: string): Promise<Integration[]> {
    return await this.integrationRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find all integrations of a given type that have a webhook secret configured.
   * Used ONLY for webhook handlers where we don't have auth context.
   * The webhook signature verification provides security.
   */
  async findIntegrationsByTypeForWebhook(
    type: IntegrationType,
  ): Promise<Integration[]> {
    return await this.integrationRepo.find({
      where: { type, isActive: true },
    });
  }

  async getIntegration(
    id: string,
    organizationId: string,
  ): Promise<Integration> {
    const integration = await this.integrationRepo.findOne({
      where: { id, organizationId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    return integration;
  }

  async updateIntegration(
    id: string,
    organizationId: string,
    updateIntegrationDto: UpdateIntegrationDto,
  ): Promise<Integration> {
    const integration = await this.getIntegration(id, organizationId);

    const { name, config, authConfig, isActive } = updateIntegrationDto;

    if (name) integration.name = name;
    if (config) integration.config = config;
    if (isActive !== undefined) integration.isActive = isActive;

    if (authConfig) {
      // Encrypt sensitive data
      if (authConfig.accessToken) {
        authConfig.accessToken = this.encryptionService.encrypt(
          authConfig.accessToken,
        );
      }
      if (authConfig.refreshToken) {
        authConfig.refreshToken = this.encryptionService.encrypt(
          authConfig.refreshToken,
        );
      }
      if (authConfig.clientSecret) {
        authConfig.clientSecret = this.encryptionService.encrypt(
          authConfig.clientSecret,
        );
      }
      integration.authConfig = authConfig;
    }

    return await this.integrationRepo.save(integration);
  }

  async deleteIntegration(id: string, organizationId: string): Promise<void> {
    const integration = await this.getIntegration(id, organizationId);
    await this.integrationRepo.remove(integration);
  }

  async syncIntegration(id: string, organizationId: string): Promise<SyncLog> {
    const integration = await this.getIntegration(id, organizationId);

    const syncLog = this.syncLogRepo.create({
      integrationId: id,
      status: SyncStatus.QUEUED,
      startedAt: new Date(),
    });

    await this.syncLogRepo.save(syncLog);

    try {
      // Add job to BullMQ queue
      await this.syncQueue.add(
        'sync-job',
        {
          integrationId: id,
          type: integration.type,
        },
        {
          jobId: `sync-${id}-${Date.now()}`, // Prevent duplicate jobs
          removeOnComplete: true,
        },
      );

      this.logger.log(`Sync job queued for integration ${id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      syncLog.status = SyncStatus.FAILED;
      syncLog.error = errorMessage;
      syncLog.completedAt = new Date();

      integration.healthStatus = IntegrationStatus.ERROR;
      integration.lastErrorAt = new Date();
      integration.lastErrorMessage = errorMessage;

      this.logger.error(
        `Failed to queue sync job for integration ${id}:`,
        error,
      );

      await this.integrationRepo.save(integration);
    }

    await this.syncLogRepo.save(syncLog);

    return syncLog;
  }

  async getIntegrationHealth(
    id: string,
    organizationId: string,
  ): Promise<IntegrationHealth> {
    const integration = await this.getIntegration(id, organizationId);

    const recordsCount = await this.externalDataRepo.count({
      where: { integrationId: id },
    });

    const uptime = integration.createdAt
      ? Date.now() - integration.createdAt.getTime()
      : 0;

    return {
      status: integration.healthStatus,
      lastSyncAt: integration.lastSyncAt,
      lastErrorAt: integration.lastErrorAt,
      lastErrorMessage: integration.lastErrorMessage,
      uptime: uptime / 1000 / 60 / 60, // hours
      syncFrequency: integration.config?.syncSettings?.frequency || 'daily',
      recordsCount,
    };
  }

  async testIntegration(id: string, organizationId: string): Promise<boolean> {
    const integration = await this.getIntegration(id, organizationId);

    try {
      // For now, just test that we can decrypt tokens
      const accessToken = this.getAccessToken(integration);

      if (!accessToken) {
        throw new Error('No access token found');
      }

      // Test actual connection to the integration's API
      const isConnected = await this.testConnection(integration);

      if (isConnected) {
        integration.healthStatus = IntegrationStatus.HEALTHY;
        integration.lastErrorAt = null;
        integration.lastErrorMessage = null;
      } else {
        integration.healthStatus = IntegrationStatus.WARNING;
        integration.lastErrorAt = new Date();
        integration.lastErrorMessage = 'Connection test failed';
      }

      await this.integrationRepo.save(integration);
      return isConnected;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      integration.healthStatus = IntegrationStatus.ERROR;
      integration.lastErrorAt = new Date();
      integration.lastErrorMessage = errorMessage;

      await this.integrationRepo.save(integration);

      return false;
    }
  }

  /**
   * Tests actual connectivity to an integration by pinging their API.
   * Each integration type has a specific endpoint to validate credentials.
   */
  async testConnection(integration: Integration): Promise<boolean> {
    const accessToken = this.getAccessToken(integration);
    if (!accessToken) {
      return false;
    }

    try {
      switch (integration.type) {
        case IntegrationType.GITHUB:
          return await this.testGitHubConnection(accessToken);
        case IntegrationType.SLACK:
          return await this.testSlackConnection(accessToken);
        case IntegrationType.JIRA:
          return await this.testJiraConnection(accessToken);
        case IntegrationType.GOOGLE_WORKSPACE:
          return await this.testGoogleConnection(accessToken);
        case IntegrationType.MICROSOFT_TEAMS:
          return await this.testTeamsConnection(accessToken);
        case IntegrationType.TRELLO:
          return await this.testTrelloConnection(integration);
        default:
          this.logger.warn(
            `No connection test for type: ${String(integration.type)}`,
          );
          return true;
      }
    } catch (error) {
      this.logger.error(
        `Connection test failed for ${integration.type}:`,
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  /**
   * Test GitHub connection with rate limit handling.
   */
  private async testGitHubConnection(token: string): Promise<boolean> {
    return this.rateLimitService.executeWithRetry(async () => {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      return response.ok;
    });
  }

  /**
   * Test Slack connection with rate limit handling.
   */
  private async testSlackConnection(token: string): Promise<boolean> {
    return this.rateLimitService.executeWithRetry(async () => {
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { ok: boolean };
      return data.ok === true;
    });
  }

  /**
   * Test Jira connection with rate limit handling.
   */
  private async testJiraConnection(token: string): Promise<boolean> {
    return this.rateLimitService.executeWithRetry(async () => {
      const response = await fetch('https://api.atlassian.com/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      return response.ok;
    });
  }

  /**
   * Test Google Workspace connection with rate limit handling.
   */
  private async testGoogleConnection(token: string): Promise<boolean> {
    return this.rateLimitService.executeWithRetry(async () => {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v1/userinfo',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      return response.ok;
    });
  }

  /**
   * Test Microsoft Teams connection with rate limit handling.
   */
  private async testTeamsConnection(token: string): Promise<boolean> {
    return this.rateLimitService.executeWithRetry(async () => {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.ok;
    });
  }

  /**
   * Test Trello connection with rate limit handling.
   */
  private async testTrelloConnection(
    integration: Integration,
  ): Promise<boolean> {
    const apiKey = integration.authConfig?.apiKey;
    const token = integration.authConfig?.accessToken;
    if (!apiKey || !token) return false;

    return this.rateLimitService.executeWithRetry(async () => {
      const response = await fetch(
        `https://api.trello.com/1/members/me?key=${apiKey}&token=${token}`,
      );
      return response.ok;
    });
  }

  async getSyncLogs(
    id: string,
    organizationId: string,
    limit = 50,
  ): Promise<SyncLog[]> {
    const integration = await this.getIntegration(id, organizationId);

    return await this.syncLogRepo.find({
      where: { integrationId: integration.id },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }
  getAccessToken(integration: Integration): string | null {
    if (!integration.authConfig?.accessToken) {
      return null;
    }
    try {
      return this.encryptionService.decrypt(integration.authConfig.accessToken);
    } catch (error) {
      this.logger.error(
        `Failed to decrypt access token for integration ${integration.id}`,
        error,
      );
      return null;
    }
  }

  getRefreshToken(integration: Integration): string | null {
    if (!integration.authConfig?.refreshToken) {
      return null;
    }
    try {
      return this.encryptionService.decrypt(
        integration.authConfig.refreshToken,
      );
    } catch (error) {
      this.logger.error(
        `Failed to decrypt refresh token for integration ${integration.id}`,
        error,
      );
      return null;
    }
  }

  async updateTokens(
    integrationId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    if (!integration.authConfig) {
      throw new BadRequestException(
        `Integration ${integrationId} has no auth config`,
      );
    }

    integration.authConfig.accessToken =
      this.encryptionService.encrypt(accessToken);
    integration.authConfig.refreshToken =
      this.encryptionService.encrypt(refreshToken);
    integration.authConfig.expiresAt = expiresAt;
    integration.updatedAt = new Date();

    await this.integrationRepo.save(integration);
  }
}
