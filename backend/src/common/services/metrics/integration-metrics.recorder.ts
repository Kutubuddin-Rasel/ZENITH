import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, register } from 'prom-client';
import type { IIntegrationMetricsRecorder } from '../../interfaces/metrics.interfaces';

/**
 * IntegrationMetricsRecorder
 *
 * SRP: Owns ONLY the integration sync / API call / token refresh
 * counters and the active-integrations + health gauges.
 *
 * Health-status numeric mapping (matches the original façade):
 *   0 = disconnected, 1 = error, 2 = warning, 3 = healthy.
 */
@Injectable()
export class IntegrationMetricsRecorder implements IIntegrationMetricsRecorder {
  private readonly syncCounter: Counter;
  private readonly syncDuration: Histogram;
  private readonly apiCallCounter: Counter;
  private readonly apiCallDuration: Histogram;
  private readonly tokenRefreshCounter: Counter;
  private readonly tokenRefreshDuration: Histogram;
  private readonly activeIntegrationsGauge: Gauge;
  private readonly integrationHealthGauge: Gauge;

  private static readonly HEALTH_VALUES = {
    disconnected: 0,
    error: 1,
    warning: 2,
    healthy: 3,
  } as const;

  constructor() {
    this.syncCounter =
      (register.getSingleMetric('integration_sync_total') as Counter) ??
      new Counter({
        name: 'integration_sync_total',
        help: 'Total number of integration syncs',
        labelNames: ['integration_type', 'status'],
        registers: [register],
      });
    this.syncDuration =
      (register.getSingleMetric(
        'integration_sync_duration_seconds',
      ) as Histogram) ??
      new Histogram({
        name: 'integration_sync_duration_seconds',
        help: 'Duration of integration syncs in seconds',
        labelNames: ['integration_type'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
        registers: [register],
      });
    this.apiCallCounter =
      (register.getSingleMetric('integration_api_calls_total') as Counter) ??
      new Counter({
        name: 'integration_api_calls_total',
        help: 'Total number of API calls to third-party services',
        labelNames: ['integration_type', 'endpoint', 'status_code'],
        registers: [register],
      });
    this.apiCallDuration =
      (register.getSingleMetric(
        'integration_api_call_duration_seconds',
      ) as Histogram) ??
      new Histogram({
        name: 'integration_api_call_duration_seconds',
        help: 'Duration of API calls to third-party services',
        labelNames: ['integration_type', 'endpoint'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
        registers: [register],
      });
    this.tokenRefreshCounter =
      (register.getSingleMetric(
        'integration_token_refresh_total',
      ) as Counter) ??
      new Counter({
        name: 'integration_token_refresh_total',
        help: 'Total number of token refresh attempts',
        labelNames: ['integration_type', 'status'],
        registers: [register],
      });
    this.tokenRefreshDuration =
      (register.getSingleMetric(
        'integration_token_refresh_duration_seconds',
      ) as Histogram) ??
      new Histogram({
        name: 'integration_token_refresh_duration_seconds',
        help: 'Duration of token refresh operations',
        labelNames: ['integration_type'],
        buckets: [0.1, 0.5, 1, 2, 5],
        registers: [register],
      });
    this.activeIntegrationsGauge =
      (register.getSingleMetric('integration_active_total') as Gauge) ??
      new Gauge({
        name: 'integration_active_total',
        help: 'Number of active integrations',
        labelNames: ['integration_type'],
        registers: [register],
      });
    this.integrationHealthGauge =
      (register.getSingleMetric('integration_health_status') as Gauge) ??
      new Gauge({
        name: 'integration_health_status',
        help: 'Health status of integrations (0=disconnected, 1=error, 2=warning, 3=healthy)',
        labelNames: ['integration_id', 'integration_type'],
        registers: [register],
      });
  }

  recordSync(
    integrationType: string,
    status: 'success' | 'failure',
    durationSeconds: number,
  ): void {
    this.syncCounter.inc({ integration_type: integrationType, status });
    this.syncDuration.observe(
      { integration_type: integrationType },
      durationSeconds,
    );
  }

  recordApiCall(
    integrationType: string,
    endpoint: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    this.apiCallCounter.inc({
      integration_type: integrationType,
      endpoint,
      status_code: statusCode.toString(),
    });
    this.apiCallDuration.observe(
      { integration_type: integrationType, endpoint },
      durationSeconds,
    );
  }

  recordTokenRefresh(
    integrationType: string,
    status: 'success' | 'failure',
    durationSeconds: number,
  ): void {
    this.tokenRefreshCounter.inc({
      integration_type: integrationType,
      status,
    });
    this.tokenRefreshDuration.observe(
      { integration_type: integrationType },
      durationSeconds,
    );
  }

  setActiveIntegrations(integrationType: string, count: number): void {
    this.activeIntegrationsGauge.set(
      { integration_type: integrationType },
      count,
    );
  }

  setIntegrationHealth(
    integrationId: string,
    integrationType: string,
    health: 'disconnected' | 'error' | 'warning' | 'healthy',
  ): void {
    this.integrationHealthGauge.set(
      { integration_id: integrationId, integration_type: integrationType },
      IntegrationMetricsRecorder.HEALTH_VALUES[health],
    );
  }
}
