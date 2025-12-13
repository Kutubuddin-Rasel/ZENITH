import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Integration,
  IntegrationStatus,
} from '../../integrations/entities/integration.entity';

/**
 * Service for monitoring integration health and triggering alerts.
 *
 * Monitors:
 * - Integration health degradation (healthy → warning → error)
 * - Repeated sync failures
 * - Token refresh failures
 * - Long periods without successful sync
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  // Alert thresholds
  private readonly FAILURE_THRESHOLD = 3; // Alert after 3 consecutive failures
  private readonly STALE_SYNC_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours in ms

  // Track failure counts (in-memory, reset on restart)
  private failureCount: Map<string, number> = new Map();

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
  ) {}

  /**
   * Checks integration health and triggers alerts if degraded.
   * Called periodically by a cron job or after sync operations.
   */
  async checkIntegrationHealth(integrationId: string): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
    });

    if (!integration) {
      return;
    }

    // Check for health degradation
    if (integration.healthStatus === IntegrationStatus.ERROR) {
      this.alertHealthDegraded(integration, 'error');
    } else if (integration.healthStatus === IntegrationStatus.WARNING) {
      this.alertHealthDegraded(integration, 'warning');
    }

    // Check for repeated failures
    const failures = this.failureCount.get(integrationId) || 0;

    if (failures >= this.FAILURE_THRESHOLD) {
      this.alertRepeatedFailures(integration, failures);
    }

    // Check for stale syncs
    if (integration.lastSyncAt) {
      const timeSinceSync =
        Date.now() - new Date(integration.lastSyncAt).getTime();
      if (timeSinceSync > this.STALE_SYNC_THRESHOLD) {
        this.alertStaleSync(integration, timeSinceSync);
      }
    }
  }

  /**
   * Records a sync failure and checks threshold.
   */
  recordSyncFailure(integrationId: string): void {
    const currentCount = this.failureCount.get(integrationId) || 0;
    this.failureCount.set(integrationId, currentCount + 1);

    this.logger.warn(
      `Integration ${integrationId} has ${currentCount + 1} consecutive failures`,
    );
  }

  /**
   * Records a sync success and resets failure count.
   */
  recordSyncSuccess(integrationId: string): void {
    this.failureCount.delete(integrationId);
  }

  /**
   * Triggers alert for health degradation.
   */
  private alertHealthDegraded(
    integration: Integration,
    level: 'warning' | 'error',
  ): void {
    const severity = level === 'error' ? '🔴 CRITICAL' : '⚠️ WARNING';

    this.logger.error(
      `${severity}: Integration health degraded for ${integration.name} (${integration.type})`,
    );

    const alertData = {
      severity: level,
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
      },
      healthStatus: integration.healthStatus,
      lastError: integration.lastErrorMessage,
      lastErrorAt: integration.lastErrorAt,
      timestamp: new Date().toISOString(),
    };

    // Log structured alert data
    this.logger.error(`Alert data: ${JSON.stringify(alertData, null, 2)}`);

    // TODO: Send webhook notification, email, Slack message, etc.
    // await this.sendWebhookAlert(alertData);
    // await this.sendEmailAlert(alertData);
  }

  /**
   * Triggers alert for repeated failures.
   */
  private alertRepeatedFailures(
    integration: Integration,
    failureCount: number,
  ): void {
    this.logger.error(
      `🔴 CRITICAL: Integration ${integration.name} has ${failureCount} consecutive sync failures`,
    );

    const alertData = {
      severity: 'error',
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
      },
      failureCount,
      lastError: integration.lastErrorMessage,
      lastErrorAt: integration.lastErrorAt,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`Alert data: ${JSON.stringify(alertData, null, 2)}`);

    // TODO: Send critical alerts via multiple channels
  }

  /**
   * Triggers alert for stale sync (no sync for extended period).
   */
  private alertStaleSync(
    integration: Integration,
    timeSinceSync: number,
  ): void {
    const hoursSinceSync = Math.floor(timeSinceSync / (60 * 60 * 1000));

    this.logger.warn(
      `⚠️ WARNING: Integration ${integration.name} hasn't synced in ${hoursSinceSync} hours`,
    );

    const alertData = {
      severity: 'warning',
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
      },
      lastSyncAt: integration.lastSyncAt,
      hoursSinceSync,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(`Alert data: ${JSON.stringify(alertData, null, 2)}`);

    // TODO: Send notification
  }

  /**
   * Gets alert summary for all integrations.
   */
  async getAlertSummary(): Promise<{
    total: number;
    critical: number;
    warning: number;
    healthy: number;
    alerts: Array<{
      integrationId: string;
      integrationType: string;
      severity: string;
      message: string;
    }>;
  }> {
    const integrations = await this.integrationRepo.find();

    const alerts: Array<{
      integrationId: string;
      integrationType: string;
      severity: string;
      message: string;
    }> = [];

    let critical = 0;
    let warning = 0;
    let healthy = 0;

    for (const integration of integrations) {
      if (
        integration.healthStatus === IntegrationStatus.ERROR ||
        integration.healthStatus === IntegrationStatus.DISCONNECTED
      ) {
        critical++;
        alerts.push({
          integrationId: integration.id,
          integrationType: integration.type,
          severity: 'critical',
          message:
            integration.lastErrorMessage || 'Integration is in error state',
        });
      } else if (integration.healthStatus === IntegrationStatus.WARNING) {
        warning++;
        alerts.push({
          integrationId: integration.id,
          integrationType: integration.type,
          severity: 'warning',
          message: 'Integration health is degraded',
        });
      } else {
        healthy++;
      }

      // Check for stale syncs
      if (integration.lastSyncAt) {
        const timeSinceSync =
          Date.now() - new Date(integration.lastSyncAt).getTime();
        if (timeSinceSync > this.STALE_SYNC_THRESHOLD) {
          const hoursSinceSync = Math.floor(timeSinceSync / (60 * 60 * 1000));
          alerts.push({
            integrationId: integration.id,
            integrationType: integration.type,
            severity: 'warning',
            message: `No sync in ${hoursSinceSync} hours`,
          });
        }
      }
    }

    return {
      total: integrations.length,
      critical,
      warning,
      healthy,
      alerts,
    };
  }
}
