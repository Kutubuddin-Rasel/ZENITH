import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Integration,
  IntegrationType,
  IntegrationStatus,
} from '../entities/integration.entity';
import {
  SyncLog,
  SyncOperation,
  SyncStatus,
} from '../entities/sync-log.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';
import { IntegrationConfig, AuthConfig } from '../entities/integration.entity';

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
  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(SyncLog)
    private syncLogRepo: Repository<SyncLog>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
  ) {}

  async createIntegration(dto: CreateIntegrationDto): Promise<Integration> {
    // Validate integration type
    if (!Object.values(IntegrationType).includes(dto.type)) {
      throw new BadRequestException('Invalid integration type');
    }

    // Check if integration already exists for this organization
    const existing = await this.integrationRepo.findOne({
      where: {
        organizationId: dto.organizationId,
        type: dto.type,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Integration already exists for this organization',
      );
    }

    const integration = this.integrationRepo.create({
      ...dto,
      healthStatus: IntegrationStatus.HEALTHY,
    });

    return await this.integrationRepo.save(integration);
  }

  async getIntegrations(organizationId: string): Promise<Integration[]> {
    return await this.integrationRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
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
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  async updateIntegration(
    id: string,
    organizationId: string,
    dto: UpdateIntegrationDto,
  ): Promise<Integration> {
    const integration = await this.getIntegration(id, organizationId);

    Object.assign(integration, dto);
    integration.updatedAt = new Date();

    return await this.integrationRepo.save(integration);
  }

  async deleteIntegration(id: string, organizationId: string): Promise<void> {
    const integration = await this.getIntegration(id, organizationId);

    // Delete related data
    await this.externalDataRepo.delete({ integrationId: id });
    await this.searchIndexRepo.delete({ integrationId: id });
    await this.syncLogRepo.delete({ integrationId: id });

    await this.integrationRepo.remove(integration);
  }

  async syncIntegration(id: string, organizationId: string): Promise<SyncLog> {
    const integration = await this.getIntegration(id, organizationId);

    if (!integration.isActive) {
      throw new BadRequestException('Integration is not active');
    }

    // Create sync log
    const syncLog = this.syncLogRepo.create({
      integrationId: id,
      operation: SyncOperation.MANUAL_SYNC,
      status: SyncStatus.RUNNING,
      startedAt: new Date(),
      details: {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        errorsCount: 0,
        errors: [],
        duration: 0,
        metadata: {},
      },
    });

    const savedSyncLog = await this.syncLogRepo.save(syncLog);

    try {
      // Update integration last sync time
      integration.lastSyncAt = new Date();
      integration.healthStatus = IntegrationStatus.HEALTHY;
      await this.integrationRepo.save(integration);

      // Complete sync log
      savedSyncLog.status = SyncStatus.SUCCESS;
      savedSyncLog.completedAt = new Date();
      savedSyncLog.details.duration =
        Date.now() - savedSyncLog.startedAt.getTime();
      await this.syncLogRepo.save(savedSyncLog);

      return savedSyncLog;
    } catch (error: unknown) {
      // Update sync log with error
      savedSyncLog.status = SyncStatus.FAILED;
      savedSyncLog.completedAt = new Date();
      savedSyncLog.details.duration =
        Date.now() - savedSyncLog.startedAt.getTime();
      savedSyncLog.details.errorsCount = 1;
      savedSyncLog.details.errors.push({
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
      await this.syncLogRepo.save(savedSyncLog);

      // Update integration health
      integration.healthStatus = IntegrationStatus.ERROR;
      integration.lastErrorAt = new Date();
      integration.lastErrorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.integrationRepo.save(integration);

      throw error;
    }
  }

  async getIntegrationHealth(
    id: string,
    organizationId: string,
  ): Promise<IntegrationHealth> {
    const integration = await this.getIntegration(id, organizationId);

    // Get recent sync logs
    const recentLogs = await this.syncLogRepo.find({
      where: { integrationId: id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    // Calculate uptime
    const successfulSyncs = recentLogs.filter(
      (log) => log.status === SyncStatus.SUCCESS,
    );
    const uptime =
      recentLogs.length > 0
        ? (successfulSyncs.length / recentLogs.length) * 100
        : 0;

    // Get records count
    const recordsCount = await this.externalDataRepo.count({
      where: { integrationId: id },
    });

    return {
      status: integration.healthStatus,
      lastSyncAt: integration.lastSyncAt,
      lastErrorAt: integration.lastErrorAt,
      lastErrorMessage: integration.lastErrorMessage,
      uptime,
      syncFrequency: integration.config.syncSettings?.frequency || 'daily',
      recordsCount,
    };
  }

  async testIntegration(id: string, organizationId: string): Promise<boolean> {
    const integration = await this.getIntegration(id, organizationId);

    try {
      // Create test sync log
      const testLog = this.syncLogRepo.create({
        integrationId: id,
        operation: SyncOperation.TEST_CONNECTION,
        status: SyncStatus.RUNNING,
        startedAt: new Date(),
        details: {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsDeleted: 0,
          errorsCount: 0,
          errors: [],
          duration: 0,
          metadata: {},
        },
      });

      const savedTestLog = await this.syncLogRepo.save(testLog);

      // Test connection based on integration type
      const isConnected = this.testConnection(integration);

      // Update test log
      savedTestLog.status = isConnected
        ? SyncStatus.SUCCESS
        : SyncStatus.FAILED;
      savedTestLog.completedAt = new Date();
      savedTestLog.details.duration =
        Date.now() - savedTestLog.startedAt.getTime();
      await this.syncLogRepo.save(savedTestLog);

      return isConnected;
    } catch (error: unknown) {
      // Update integration health
      integration.healthStatus = IntegrationStatus.ERROR;
      integration.lastErrorAt = new Date();
      integration.lastErrorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.integrationRepo.save(integration);

      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private testConnection(_integration: Integration): boolean {
    // This would be implemented by specific integration services
    // For now, return true as a placeholder
    return true;
  }

  async getSyncLogs(
    id: string,
    organizationId: string,
    limit = 50,
  ): Promise<SyncLog[]> {
    await this.getIntegration(id, organizationId);

    return await this.syncLogRepo.find({
      where: { integrationId: id },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
