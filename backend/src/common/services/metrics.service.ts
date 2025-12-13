import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge, Registry, register } from 'prom-client';

/**
 * Service for collecting and exposing Prometheus metrics.
 *
 * Tracks:
 * - Sync success/failure rates
 * - API call latencies
 * - Token refresh success rates
 * - Active integration counts
 */
@Injectable()
export class MetricsService {
  private registry: Registry;

  // Sync metrics
  private syncCounter: Counter;
  private syncDuration: Histogram;

  // API call metrics
  private apiCallCounter: Counter;
  private apiCallDuration: Histogram;

  // Token metrics
  private tokenRefreshCounter: Counter;
  private tokenRefreshDuration: Histogram;

  // Integration metrics
  private activeIntegrationsGauge: Gauge;
  private integrationHealthGauge: Gauge;

  constructor() {
    // Use default registry
    this.registry = register;

    // Initialize sync metrics
    this.syncCounter = new Counter({
      name: 'integration_sync_total',
      help: 'Total number of integration syncs',
      labelNames: ['integration_type', 'status'], // status: success, failure
      registers: [this.registry],
    });

    this.syncDuration = new Histogram({
      name: 'integration_sync_duration_seconds',
      help: 'Duration of integration syncs in seconds',
      labelNames: ['integration_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120], // seconds
      registers: [this.registry],
    });

    // Initialize API call metrics
    this.apiCallCounter = new Counter({
      name: 'integration_api_calls_total',
      help: 'Total number of API calls to third-party services',
      labelNames: ['integration_type', 'endpoint', 'status_code'],
      registers: [this.registry],
    });

    this.apiCallDuration = new Histogram({
      name: 'integration_api_call_duration_seconds',
      help: 'Duration of API calls to third-party services',
      labelNames: ['integration_type', 'endpoint'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // seconds
      registers: [this.registry],
    });

    // Initialize token metrics
    this.tokenRefreshCounter = new Counter({
      name: 'integration_token_refresh_total',
      help: 'Total number of token refresh attempts',
      labelNames: ['integration_type', 'status'], // status: success, failure
      registers: [this.registry],
    });

    this.tokenRefreshDuration = new Histogram({
      name: 'integration_token_refresh_duration_seconds',
      help: 'Duration of token refresh operations',
      labelNames: ['integration_type'],
      buckets: [0.1, 0.5, 1, 2, 5], // seconds
      registers: [this.registry],
    });

    // Initialize integration metrics
    this.activeIntegrationsGauge = new Gauge({
      name: 'integration_active_total',
      help: 'Number of active integrations',
      labelNames: ['integration_type'],
      registers: [this.registry],
    });

    this.integrationHealthGauge = new Gauge({
      name: 'integration_health_status',
      help: 'Health status of integrations (0=disconnected, 1=error, 2=warning, 3=healthy)',
      labelNames: ['integration_id', 'integration_type'],
      registers: [this.registry],
    });
  }

  /**
   * Records a sync operation.
   */
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

  /**
   * Records an API call to a third-party service.
   */
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

  /**
   * Records a token refresh operation.
   */
  recordTokenRefresh(
    integrationType: string,
    status: 'success' | 'failure',
    durationSeconds: number,
  ): void {
    this.tokenRefreshCounter.inc({ integration_type: integrationType, status });
    this.tokenRefreshDuration.observe(
      { integration_type: integrationType },
      durationSeconds,
    );
  }

  /**
   * Updates the count of active integrations.
   */
  setActiveIntegrations(integrationType: string, count: number): void {
    this.activeIntegrationsGauge.set(
      { integration_type: integrationType },
      count,
    );
  }

  /**
   * Updates the health status of an integration.
   *
   * Health values:
   * - 0: disconnected
   * - 1: error
   * - 2: warning
   * - 3: healthy
   */
  setIntegrationHealth(
    integrationId: string,
    integrationType: string,
    health: 'disconnected' | 'error' | 'warning' | 'healthy',
  ): void {
    const healthValue = {
      disconnected: 0,
      error: 1,
      warning: 2,
      healthy: 3,
    }[health];

    this.integrationHealthGauge.set(
      { integration_id: integrationId, integration_type: integrationType },
      healthValue,
    );
  }

  /**
   * Returns Prometheus metrics in text format.
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Returns metrics as JSON for debugging.
   */
  async getMetricsJSON(): Promise<any> {
    return this.registry.getMetricsAsJSON();
  }

  /**
   * Helper to measure execution time of a function.
   */
  async measureDuration<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    return { result, duration };
  }
}
