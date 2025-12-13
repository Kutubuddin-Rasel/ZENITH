import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration } from '../entities/integration.entity';
import { ExternalData, MappedData } from '../entities/external-data.entity';
import { SearchIndex, SearchMetadata } from '../entities/search-index.entity';
import { RateLimitService } from './rate-limit.service';
import { TokenManagerService } from './token-manager.service';
import { EncryptionService } from '../../common/services/encryption.service';

/**
 * Base class for integration services providing common functionality.
 *
 * Features:
 * - External data storage with upsert
 * - Search index updates
 * - Rate limit handling via executeWithRetry
 * - Token refresh via executeWithTokenRefresh
 */
@Injectable()
export abstract class BaseIntegrationService {
  protected abstract readonly logger: Logger;
  protected abstract readonly source: string;

  constructor(
    @InjectRepository(Integration)
    protected readonly integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    protected readonly externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    protected readonly searchIndexRepo: Repository<SearchIndex>,
    protected readonly rateLimitService: RateLimitService,
    protected readonly tokenManagerService: TokenManagerService,
    protected readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Executes an API call with automatic token refresh and rate limit handling.
   *
   * @param integrationId - Integration ID
   * @param fn - Function to execute (receives decrypted access token)
   * @returns Result of the function
   */
  protected async executeWithTokenAndRetry<T>(
    integrationId: string,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    return this.tokenManagerService.executeWithTokenRefresh(
      integrationId,
      async (token) => {
        return this.rateLimitService.executeWithRetry(async () => fn(token));
      },
    );
  }

  /**
   * Gets decrypted access token from integration.
   */
  protected getDecryptedAccessToken(integration: Integration): string {
    const accessToken = integration.authConfig?.accessToken;

    if (!accessToken) {
      throw new Error(
        `No access token found for integration ${integration.id}. Please re-authenticate.`,
      );
    }

    try {
      return this.encryptionService.decrypt(accessToken);
    } catch {
      // Token might not be encrypted (legacy data)
      return accessToken;
    }
  }

  /**
   * Stores external data with upsert logic.
   * Creates new record or updates existing one.
   *
   * @param integrationId - Integration ID
   * @param type - Data type (e.g., 'repository', 'issue', 'message')
   * @param externalId - External system's ID for this record
   * @param rawData - Raw data from external API
   */
  protected async storeExternalData(
    integrationId: string,
    type: string,
    externalId: string,
    rawData: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Check if data already exists
      const existing = await this.externalDataRepo.findOne({
        where: {
          integrationId,
          externalId,
          externalType: type,
        },
      });

      const mappedData = this.mapExternalData(type, rawData);

      if (!mappedData) {
        return;
      }

      if (existing) {
        existing.rawData = rawData;
        existing.mappedData = mappedData;
        existing.lastSyncAt = new Date();
        await this.externalDataRepo.save(existing);
      } else {
        const externalData = this.externalDataRepo.create({
          integrationId,
          externalId,
          externalType: type,
          rawData,
          mappedData,
          lastSyncAt: new Date(),
        });
        await this.externalDataRepo.save(externalData);
      }

      // Update search index
      await this.updateSearchIndex(integrationId, type, externalId, mappedData);
    } catch (error) {
      this.logger.error('Failed to store external data:', error);
    }
  }

  /**
   * Maps raw external data to standard MappedData format.
   * Must be implemented by each integration service.
   */
  protected abstract mapExternalData(
    type: string,
    data: Record<string, unknown>,
  ): MappedData | null;

  /**
   * Updates the search index for the given data.
   */
  protected async updateSearchIndex(
    integrationId: string,
    type: string,
    externalId: string,
    mappedData: MappedData,
  ): Promise<void> {
    try {
      const searchContent =
        `${mappedData.title} ${mappedData.content}`.toLowerCase();

      const existing = await this.searchIndexRepo.findOne({
        where: {
          integrationId,
          contentType: type,
        },
      });

      const searchMetadata: SearchMetadata = {
        source: mappedData.source,
        url: mappedData.url,
        author: mappedData.author,
        timestamp: new Date(),
        tags: [],
        priority: 1,
        ...mappedData.metadata,
      };

      if (existing) {
        existing.title = mappedData.title;
        existing.content = mappedData.content;
        existing.metadata = searchMetadata;
        existing.searchVector = searchContent;
        existing.updatedAt = new Date();
        await this.searchIndexRepo.save(existing);
      } else {
        const searchIndex = this.searchIndexRepo.create({
          integrationId,
          contentType: type,
          title: mappedData.title,
          content: mappedData.content,
          metadata: searchMetadata,
          searchVector: searchContent,
        });
        await this.searchIndexRepo.save(searchIndex);
      }
    } catch (error) {
      this.logger.error('Failed to update search index:', error);
    }
  }
}
