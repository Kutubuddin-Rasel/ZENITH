import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Integration, IntegrationStatus } from '../entities/integration.entity';
import { IntegrationService } from './integration.service';
import { OAuthService } from './oauth.service';
import { EncryptionService } from '../../common/services/encryption.service';

/**
 * Service for managing OAuth token lifecycle (expiration, refresh, rotation).
 *
 * Automatically refreshes tokens before they expire and handles token rotation
 * for enhanced security.
 */
@Injectable()
export class TokenManagerService {
  private readonly logger = new Logger(TokenManagerService.name);

  // Refresh tokens when they have less than 5 minutes remaining
  private readonly TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes in ms

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    private integrationService: IntegrationService,
    private oauthService: OAuthService,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Executes a function with automatic token refresh if needed.
   *
   * This wraps any API call to ensure the access token is valid.
   * If the token is expired or expiring soon, it will be refreshed automatically.
   * If the first call fails with 401, it will retry after refreshing the token.
   *
   * @param integrationId - Integration ID
   * @param fn - Function to execute (receives decrypted access token)
   * @returns Result of the function
   *
   * @example
   * const repos = await tokenManager.executeWithTokenRefresh(
   *   integrationId,
   *   async (token) => {
   *     return await fetch('https://api.github.com/user/repos', {
   *       headers: { Authorization: `Bearer ${token}` }
   *     });
   *   }
   * );
   */
  async executeWithTokenRefresh<T>(
    integrationId: string,
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    // Check if token needs refresh (expired or expiring soon)
    await this.refreshTokenIfNeeded(integration);

    // Get the current access token
    const accessToken = this.integrationService.getAccessToken(integration);

    if (!accessToken) {
      throw new Error(
        `No access token found for integration ${integrationId}. Please re-authenticate.`,
      );
    }

    try {
      // Execute the function with the valid token
      return await fn(accessToken);
    } catch (error) {
      // If we get a 401 Unauthorized, try refreshing the token once
      if (this.isUnauthorizedError(error)) {
        this.logger.warn(
          `Got 401 error for integration ${integrationId}, attempting token refresh...`,
        );

        // Force token refresh
        await this.forceRefreshToken(integration);

        // Get the refreshed integration
        const refreshedIntegration = await this.integrationRepo.findOne({
          where: { id: integrationId },
        });

        if (!refreshedIntegration) {
          throw new Error('Integration not found after refresh');
        }

        const newAccessToken =
          this.integrationService.getAccessToken(refreshedIntegration);

        if (!newAccessToken) {
          throw new Error('Token refresh failed, please re-authenticate');
        }

        // Retry the function with the new token
        return await fn(newAccessToken);
      }

      // If it's not a 401 error, rethrow
      throw error;
    }
  }

  /**
   * Refreshes token if it's expired or expiring soon.
   */
  private async refreshTokenIfNeeded(integration: Integration): Promise<void> {
    const expiresAt = integration.authConfig?.expiresAt;

    if (!expiresAt) {
      this.logger.warn(
        `Integration ${integration.id} has no expiration date, skipping refresh check`,
      );
      return;
    }

    const expiresAtTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiresAtTime - now;

    // If token is expired or expiring soon (< 5 minutes)
    if (timeUntilExpiry < this.TOKEN_REFRESH_THRESHOLD) {
      this.logger.log(
        `Token for integration ${integration.id} expires in ${Math.floor(timeUntilExpiry / 1000)}s, refreshing...`,
      );
      await this.forceRefreshToken(integration);
    }
  }

  /**
   * Forces a token refresh for an integration.
   */
  private async forceRefreshToken(integration: Integration): Promise<void> {
    const refreshToken = this.integrationService.getRefreshToken(integration);

    if (!refreshToken) {
      throw new Error(
        `No refresh token found for integration ${integration.id}. Cannot refresh access token. Please re-authenticate.`,
      );
    }

    try {
      // Call OAuth service to refresh the token
      const newTokens = await this.oauthService.refreshAccessToken(
        integration.type,
        refreshToken,
      );

      // Calculate new expiration
      const expiresAt = newTokens.expires_in
        ? new Date(Date.now() + newTokens.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      // Update the integration with new tokens
      await this.integrationService.updateTokens(
        integration.id,
        newTokens.access_token,
        newTokens.refresh_token || refreshToken, // Use new refresh token if provided, else keep old one
        expiresAt,
      );

      // Update health status
      integration.healthStatus = IntegrationStatus.HEALTHY;
      integration.lastErrorAt = null;
      integration.lastErrorMessage = null;
      await this.integrationRepo.save(integration);

      this.logger.log(
        `Successfully refreshed token for integration ${integration.id}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Update health status to error
      integration.healthStatus = IntegrationStatus.ERROR;
      integration.lastErrorAt = new Date();
      integration.lastErrorMessage = `Token refresh failed: ${errorMessage}`;
      await this.integrationRepo.save(integration);

      this.logger.error(
        `Failed to refresh token for integration ${integration.id}:`,
        error,
      );

      throw new Error(
        `Token refresh failed: ${errorMessage}. Please re-authenticate the integration.`,
      );
    }
  }

  /**
   * Checks if an error is a 401 Unauthorized error.
   */
  private isUnauthorizedError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as {
        status?: number;
        statusCode?: number;
        response?: { status?: number };
      };
      return (
        err.status === 401 ||
        err.statusCode === 401 ||
        err.response?.status === 401
      );
    }
    return false;
  }

  /**
   * Proactively refreshes tokens that are expiring soon.
   * Runs every 10 minutes via cron to ensure tokens are always fresh.
   *
   * @returns Number of tokens refreshed
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshExpiringTokens(): Promise<number> {
    this.logger.log('Checking for expiring tokens...');

    // Find all active integrations with OAuth
    const integrations = await this.integrationRepo.find({
      where: {
        isActive: true,
      },
    });

    const oauthIntegrations = integrations.filter(
      (i) => i.authConfig?.type === 'oauth' && i.authConfig?.expiresAt,
    );

    let refreshedCount = 0;

    for (const integration of oauthIntegrations) {
      const expiresAt = integration.authConfig.expiresAt;
      if (!expiresAt) continue;

      const expiresAtTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const timeUntilExpiry = expiresAtTime - now;

      // Refresh if expiring in next hour
      if (timeUntilExpiry < 60 * 60 * 1000 && timeUntilExpiry > 0) {
        try {
          await this.forceRefreshToken(integration);
          refreshedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to refresh token for integration ${integration.id}:`,
            error,
          );
        }
      }
    }

    this.logger.log(
      `Proactive token refresh complete. Refreshed ${refreshedCount} tokens.`,
    );

    return refreshedCount;
  }

  /**
   * Validates that an integration has a valid, non-expired token.
   *
   * @returns true if token is valid, false otherwise
   */
  async validateToken(integrationId: string): Promise<boolean> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
    });

    if (!integration) {
      return false;
    }

    const accessToken = this.integrationService.getAccessToken(integration);
    if (!accessToken) {
      return false;
    }

    const expiresAt = integration.authConfig?.expiresAt;
    if (!expiresAt) {
      // No expiration date, assume valid (might be API key)
      return true;
    }

    // Check if token is not expired
    return new Date(expiresAt).getTime() > Date.now();
  }
}
