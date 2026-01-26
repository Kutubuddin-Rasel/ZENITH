import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  register,
  collectDefaultMetrics,
} from 'prom-client';
import { DataSource } from 'typeorm';

/**
 * Strict type definitions for metric labels (ZERO TOLERANCE FOR ANY)
 */
export interface HttpMetricLabels {
  method: string;
  route: string;
  status: string;
}

export interface CacheMetricLabels {
  namespace: string;
}

/**
 * Performance metrics summary DTO
 * Used for dashboard APIs and monitoring
 */
export interface PerformanceMetrics {
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  http: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
  };
}

/**
 * Circuit Breaker metric labels (Phase 4 - Circuit Breaker Remediation)
 */
export interface BreakerMetricLabels {
  name: string;
}

/**
 * Circuit Breaker event types for metrics (Phase 4)
 * Avoids magic strings in event listener code
 */
export type BreakerEventType =
  | 'success'
  | 'failure'
  | 'timeout'
  | 'reject'
  | 'fallback';

/**
 * Circuit Breaker state numeric mapping (Phase 4)
 * Used for Prometheus gauge values
 *
 * MAPPING RATIONALE:
 * - CLOSED (0): Normal/Healthy - no alert
 * - HALF_OPEN (0.5): Recovery testing - informational
 * - OPEN (1): Broken - should trigger alert
 *
 * This allows simple Grafana alerts: circuit_breaker_state > 0
 */
export const BREAKER_STATE_VALUES = {
  CLOSED: 0,
  HALF_OPEN: 0.5,
  OPEN: 1,
} as const;

/**
 * Unified Prometheus Metrics Service
 *
 * This is the SINGLE source of truth for all Prometheus metrics in Zenith.
 * Consolidates both Node.js runtime metrics and application-specific metrics.
 *
 * Metrics Categories:
 * 1. Node.js Runtime (via collectDefaultMetrics):
 *    - nodejs_active_handles_total
 *    - nodejs_heap_size_total_bytes
 *    - nodejs_eventloop_lag_seconds
 *    - process_cpu_*
 *
 * 2. Cache Metrics (Phase 3 - Performance Remediation):
 *    - cache_hits_total (counter by namespace)
 *    - cache_misses_total (counter by namespace)
 *
 * 3. HTTP Request Metrics (Phase 3 - Performance Remediation):
 *    - http_requests_total (counter by method, route, status)
 *    - http_request_duration_seconds (histogram by method, route)
 *    - http_errors_total (counter for 4xx/5xx responses)
 *
 * 4. Database Pool Metrics (Phase 5 - Database Remediation):
 *    - db_pool_total (current total connections)
 *    - db_pool_idle (idle connections available)
 *    - db_pool_waiting (clients waiting for connection)
 *
 * 5. Integration Metrics:
 *    - integration_sync_total (counter)
 *    - integration_sync_duration_seconds (histogram)
 *    - integration_api_calls_total (counter)
 *    - integration_api_call_duration_seconds (histogram)
 *    - integration_token_refresh_total (counter)
 *    - integration_active_total (gauge)
 *    - integration_health_status (gauge)
 *
 * All metrics use the global prom-client registry to ensure
 * they are all exposed at a single /metrics endpoint.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry: Registry;

  // Sync metrics
  private syncCounter: Counter;
  private syncDuration: Histogram;

  // API call metrics
  private apiCallCounter: Counter;
  private apiCallDuration: Histogram;

  // Token metrics
  private tokenRefreshCounter: Counter;
  private tokenRefreshDuration: Histogram;

  // Integration health metrics
  private activeIntegrationsGauge: Gauge;
  private integrationHealthGauge: Gauge;

  // Database pool metrics (Phase 5 - Database Remediation)
  private dbPoolTotalGauge: Gauge;
  private dbPoolIdleGauge: Gauge;
  private dbPoolWaitingGauge: Gauge;

  // =========================================================================
  // CACHE METRICS (Phase 3 - Performance Remediation)
  // =========================================================================
  private cacheHitsCounter: Counter;
  private cacheMissesCounter: Counter;

  // =========================================================================
  // HTTP REQUEST METRICS (Phase 3 - Performance Remediation)
  // =========================================================================
  private httpRequestsCounter: Counter;
  private httpRequestDuration: Histogram;
  private httpErrorsCounter: Counter;

  // =========================================================================
  // CIRCUIT BREAKER METRICS (Phase 4 - Circuit Breaker Remediation)
  // State: 0=CLOSED (healthy), 0.5=HALF_OPEN (recovering), 1=OPEN (broken)
  // =========================================================================
  private circuitBreakerStateGauge: Gauge;
  private circuitBreakerEventsCounter: Counter;

  constructor(@Optional() private dataSource?: DataSource) {
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

    // =========================================================================
    // DATABASE POOL METRICS (Phase 5 - Database Remediation)
    // Uses collect() callback for on-demand metrics when /metrics is scraped
    // =========================================================================
    this.dbPoolTotalGauge = new Gauge({
      name: 'db_pool_total',
      help: 'Total number of connections in the database pool',
      registers: [this.registry],
      collect: () => {
        const poolStats = this.getPoolStats();
        this.dbPoolTotalGauge.set(poolStats.total);
      },
    });

    this.dbPoolIdleGauge = new Gauge({
      name: 'db_pool_idle',
      help: 'Number of idle connections in the database pool',
      registers: [this.registry],
      collect: () => {
        const poolStats = this.getPoolStats();
        this.dbPoolIdleGauge.set(poolStats.idle);
      },
    });

    this.dbPoolWaitingGauge = new Gauge({
      name: 'db_pool_waiting',
      help: 'Number of clients waiting for a database connection',
      registers: [this.registry],
      collect: () => {
        const poolStats = this.getPoolStats();
        this.dbPoolWaitingGauge.set(poolStats.waiting);
      },
    });

    // =========================================================================
    // CACHE METRICS (Phase 3 - Performance Remediation)
    // Used for cache hit rate calculation and monitoring
    // =========================================================================
    this.cacheHitsCounter = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.cacheMissesCounter = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    // =========================================================================
    // HTTP REQUEST METRICS (Phase 3 - Performance Remediation)
    // Used for request rate, error rate, and response time monitoring
    // =========================================================================
    this.httpRequestsCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], // seconds
      registers: [this.registry],
    });

    this.httpErrorsCounter = new Counter({
      name: 'http_errors_total',
      help: 'Total number of HTTP errors (4xx and 5xx responses)',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    // =========================================================================
    // CIRCUIT BREAKER METRICS (Phase 4 - Circuit Breaker Remediation)
    // State gauge: 0=CLOSED, 0.5=HALF_OPEN, 1=OPEN
    // =========================================================================
    this.circuitBreakerStateGauge = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Current state of circuit breaker (0=CLOSED, 0.5=HALF_OPEN, 1=OPEN)',
      labelNames: ['name'],
      registers: [this.registry],
    });

    this.circuitBreakerEventsCounter = new Counter({
      name: 'circuit_breaker_events_total',
      help: 'Total circuit breaker events',
      labelNames: ['name', 'event_type'],
      registers: [this.registry],
    });
  }

  /**
   * Lifecycle hook: Initialize Node.js default metrics collection.
   *
   * This collects standard Node.js metrics that Prometheus expects:
   * - CPU usage (process_cpu_*)
   * - Memory usage (nodejs_heap_*, process_resident_memory_bytes)
   * - Event loop lag (nodejs_eventloop_lag_*)
   * - Active handles (nodejs_active_*)
   * - GC metrics (nodejs_gc_*)
   */
  onModuleInit(): void {
    collectDefaultMetrics({
      register: this.registry,
      prefix: '', // No prefix - use standard naming
    });

    const dbStatus = this.dataSource ? 'connected' : 'not injected';
    this.logger.log(
      `Prometheus metrics initialized: Node.js defaults + Integration + Database Pool (${dbStatus})`,
    );
  }

  /**
   * Access the underlying pg-pool stats from TypeORM's DataSource.
   *
   * ARCHITECTURE (Phase 5 - Database Remediation):
   * - TypeORM wraps the pg driver, pool is at driver.master.pool or driver.pool
   * - Uses safe access with fallbacks to 0 if pool is unavailable
   * - Called on-demand when Prometheus scrapes /metrics
   */
  private getPoolStats(): { total: number; idle: number; waiting: number } {
    try {
      if (!this.dataSource || !this.dataSource.isInitialized) {
        return { total: 0, idle: 0, waiting: 0 };
      }

      // Access the underlying pg driver
      // TypeORM driver internals are not publicly typed, but we need pool stats for monitoring
      interface DriverPool {
        totalCount?: number;
        idleCount?: number;
        waitingCount?: number;
      }
      interface TypeORMDriver {
        master?: { pool?: DriverPool };
        pool?: DriverPool;
      }
      const driver = this.dataSource.driver as TypeORMDriver;

      // Try master pool first (replication mode), then direct pool
      const pool = driver?.master?.pool || driver?.pool;

      if (!pool) {
        return { total: 0, idle: 0, waiting: 0 };
      }

      return {
        total: pool.totalCount ?? 0,
        idle: pool.idleCount ?? 0,
        waiting: pool.waitingCount ?? 0,
      };
    } catch (error) {
      this.logger.warn('Failed to get database pool stats:', error);
      return { total: 0, idle: 0, waiting: 0 };
    }
  }

  /**
   * Returns the proper Content-Type for Prometheus metrics.
   * Required for Prometheus scraping to work correctly.
   */
  getMetricsContentType(): string {
    return this.registry.contentType;
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
   * Returns array of metric objects from prom-client registry.
   */
  async getMetricsJSON(): Promise<object[]> {
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

  // ===========================================================================
  // CACHE METRICS METHODS (Phase 3 - Performance Remediation)
  // ===========================================================================

  /**
   * Record a cache hit.
   * Call this when CacheService.get() returns data (not null).
   *
   * @param namespace - Cache namespace (e.g., 'api', 'user', 'session')
   */
  recordCacheHit(namespace: string = 'default'): void {
    this.cacheHitsCounter.inc({ namespace });
  }

  /**
   * Record a cache miss.
   * Call this when CacheService.get() returns null.
   *
   * @param namespace - Cache namespace (e.g., 'api', 'user', 'session')
   */
  recordCacheMiss(namespace: string = 'default'): void {
    this.cacheMissesCounter.inc({ namespace });
  }

  // ===========================================================================
  // HTTP REQUEST METRICS METHODS (Phase 3 - Performance Remediation)
  // ===========================================================================

  /**
   * Record an HTTP request.
   * Called by middleware/interceptor on every request completion.
   *
   * @param labels - HTTP metric labels (method, route, status)
   * @param durationSeconds - Request duration in seconds
   */
  recordHttpRequest(labels: HttpMetricLabels, durationSeconds: number): void {
    this.httpRequestsCounter.inc({
      method: labels.method,
      route: labels.route,
      status: labels.status,
    });

    this.httpRequestDuration.observe(
      { method: labels.method, route: labels.route },
      durationSeconds,
    );

    // Track errors separately (4xx and 5xx status codes)
    const statusCode = parseInt(labels.status, 10);
    if (statusCode >= 400) {
      this.httpErrorsCounter.inc({
        method: labels.method,
        route: labels.route,
        status: labels.status,
      });
    }
  }

  // ===========================================================================
  // PERFORMANCE SUMMARY (Phase 3 - Performance Remediation)
  // ===========================================================================

  /**
   * Get real-time performance metrics summary.
   * Replaces mock data with actual Prometheus counter values.
   *
   * Formula for hit rate: hits / (hits + misses)
   * Handles division by zero: returns 0 if no data.
   *
   * @returns PerformanceMetrics with real data from Prometheus counters
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      // Get raw counter values from Prometheus
      const cacheHitsMetric = await this.cacheHitsCounter.get();
      const cacheMissesMetric = await this.cacheMissesCounter.get();
      const httpRequestsMetric = await this.httpRequestsCounter.get();
      const httpErrorsMetric = await this.httpErrorsCounter.get();

      // Sum all values across labels
      const hits = cacheHitsMetric.values.reduce((sum, v) => sum + v.value, 0);
      const misses = cacheMissesMetric.values.reduce(
        (sum, v) => sum + v.value,
        0,
      );
      const totalRequests = httpRequestsMetric.values.reduce(
        (sum, v) => sum + v.value,
        0,
      );
      const totalErrors = httpErrorsMetric.values.reduce(
        (sum, v) => sum + v.value,
        0,
      );

      // Calculate rates (handle division by zero)
      const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
      const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

      return {
        cache: {
          hits,
          misses,
          hitRate: Math.round(hitRate * 10000) / 10000, // 4 decimal places
        },
        http: {
          totalRequests,
          totalErrors,
          errorRate: Math.round(errorRate * 10000) / 10000, // 4 decimal places
        },
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get performance metrics:',
        error instanceof Error ? error.message : 'Unknown error',
      );

      // Return zeros on error (fail safe)
      return {
        cache: { hits: 0, misses: 0, hitRate: 0 },
        http: { totalRequests: 0, totalErrors: 0, errorRate: 0 },
      };
    }
  }

  // ===========================================================================
  // CIRCUIT BREAKER METRICS METHODS (Phase 4 - Circuit Breaker Remediation)
  // ===========================================================================

  /**
   * Set the current state of a circuit breaker.
   *
   * NUMERIC MAPPING:
   * - CLOSED (0): Normal/Healthy - circuit is working
   * - HALF_OPEN (0.5): Recovery testing - trying to recover
   * - OPEN (1): Broken - circuit is tripped, failing fast
   *
   * This allows Grafana alerts like: circuit_breaker_state > 0
   *
   * @param name - Circuit breaker name (e.g., 'github-api')
   * @param state - State value using BREAKER_STATE_VALUES
   */
  setCircuitBreakerState(
    name: string,
    state: (typeof BREAKER_STATE_VALUES)[keyof typeof BREAKER_STATE_VALUES],
  ): void {
    this.circuitBreakerStateGauge.set({ name }, state);
  }

  /**
   * Record a circuit breaker event (success, failure, timeout, etc.)
   *
   * @param name - Circuit breaker name (e.g., 'github-api')
   * @param eventType - Event type (success, failure, timeout, reject, fallback)
   */
  recordCircuitBreakerEvent(name: string, eventType: BreakerEventType): void {
    this.circuitBreakerEventsCounter.inc({ name, event_type: eventType });
  }
}
