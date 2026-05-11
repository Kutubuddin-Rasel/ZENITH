import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationStatus } from '../entities/integration.entity';
import { ALERT_DISPATCHER_TOKEN, FAILURE_TRACKER_TOKEN } from '../../common/constants/alerting.tokens';
import {
  AlertSeverity,
  type AlertPayload,
  type IAlertDispatcher,
  type IFailureTracker,
} from '../../common/interfaces/alerting.interfaces';
import type {
  AlertSummary,
  AlertSummaryEntry,
  IIntegrationAlertOrchestrator,
} from '../../common/interfaces/integration-alerting.interfaces';

const FAILURE_THRESHOLD = 3;
const STALE_SYNC_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * IntegrationAlertService
 *
 * SRP: Orchestrates Integration-domain alerting — queries the
 * `Integration` repository, builds payloads, and delegates transport
 * to `IAlertDispatcher`. The `Integration` entity dependency now lives
 * inside the `integrations` module (its rightful owner), curing the
 * upward DIP violation that previously polluted `common`.
 *
 * Implements `IIntegrationAlertOrchestrator` — bound to
 * `INTEGRATION_ALERT_ORCHESTRATOR_TOKEN` so any cross-module consumer
 * can resolve it via `ModuleRef` without an upward import on
 * `IntegrationsModule`.
 */
@Injectable()
export class IntegrationAlertService
  implements IIntegrationAlertOrchestrator
{
  private readonly logger = new Logger(IntegrationAlertService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
    @Optional()
    @Inject(ALERT_DISPATCHER_TOKEN)
    private readonly dispatcher?: IAlertDispatcher,
    @Optional()
    @Inject(FAILURE_TRACKER_TOKEN)
    private readonly failureTracker?: IFailureTracker,
  ) {}

  async checkIntegrationHealth(integrationId: string): Promise<void> {
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
    });
    if (!integration) return;

    if (integration.healthStatus === IntegrationStatus.ERROR) {
      this.alertHealthDegraded(integration, 'error');
    } else if (integration.healthStatus === IntegrationStatus.WARNING) {
      this.alertHealthDegraded(integration, 'warning');
    }

    const failures = await this.getFailureCount(integrationId);
    if (failures >= FAILURE_THRESHOLD) {
      this.alertRepeatedFailures(integration, failures);
    }

    if (integration.lastSyncAt) {
      const timeSinceSync =
        Date.now() - new Date(integration.lastSyncAt).getTime();
      if (timeSinceSync > STALE_SYNC_THRESHOLD_MS) {
        this.alertStaleSync(integration, timeSinceSync);
      }
    }
  }

  async recordSyncFailure(integrationId: string): Promise<number> {
    if (!this.failureTracker) return 0;
    return this.failureTracker.recordFailure(integrationId);
  }

  async recordSyncSuccess(integrationId: string): Promise<void> {
    if (!this.failureTracker) return;
    await this.failureTracker.recordSuccess(integrationId);
  }

  async getFailureCount(integrationId: string): Promise<number> {
    if (!this.failureTracker) return 0;
    return this.failureTracker.getCount(integrationId);
  }

  async getAlertSummary(): Promise<AlertSummary> {
    const integrations = await this.integrationRepo.find();
    const alerts: AlertSummaryEntry[] = [];

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

      if (integration.lastSyncAt) {
        const timeSinceSync =
          Date.now() - new Date(integration.lastSyncAt).getTime();
        if (timeSinceSync > STALE_SYNC_THRESHOLD_MS) {
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

    return { total: integrations.length, critical, warning, healthy, alerts };
  }

  private alertHealthDegraded(
    integration: Integration,
    level: 'warning' | 'error',
  ): void {
    const severity =
      level === 'error' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    this.logger.error(
      `Integration health degraded for ${integration.name} (${integration.type}): ${level}`,
    );
    const payload: AlertPayload = {
      severity,
      title: `Integration Health Degraded: ${integration.name}`,
      message: `${integration.name} (${integration.type}) health status is ${level}`,
      context: {
        integrationId: integration.id,
        integrationType: integration.type,
        healthStatus: integration.healthStatus,
        lastError: integration.lastErrorMessage,
        lastErrorAt: integration.lastErrorAt,
      },
      timestamp: new Date().toISOString(),
    };
    this.dispatcher?.dispatch(payload);
  }

  private alertRepeatedFailures(
    integration: Integration,
    failureCount: number,
  ): void {
    this.logger.error(
      `Integration ${integration.name} has ${failureCount} consecutive sync failures`,
    );
    const payload: AlertPayload = {
      severity: AlertSeverity.CRITICAL,
      title: `Repeated Sync Failures: ${integration.name}`,
      message: `${integration.name} has ${failureCount} consecutive sync failures`,
      context: {
        integrationId: integration.id,
        integrationType: integration.type,
        failureCount,
        lastError: integration.lastErrorMessage,
        lastErrorAt: integration.lastErrorAt,
      },
      timestamp: new Date().toISOString(),
    };
    this.dispatcher?.dispatch(payload);
  }

  private alertStaleSync(
    integration: Integration,
    timeSinceSync: number,
  ): void {
    const hoursSinceSync = Math.floor(timeSinceSync / (60 * 60 * 1000));
    this.logger.warn(
      `Integration ${integration.name} hasn't synced in ${hoursSinceSync} hours`,
    );
    const payload: AlertPayload = {
      severity: AlertSeverity.WARNING,
      title: `Stale Sync: ${integration.name}`,
      message: `${integration.name} hasn't synced in ${hoursSinceSync} hours`,
      context: {
        integrationId: integration.id,
        integrationType: integration.type,
        lastSyncAt: integration.lastSyncAt,
        hoursSinceSync,
      },
      timestamp: new Date().toISOString(),
    };
    this.dispatcher?.dispatch(payload);
  }
}
