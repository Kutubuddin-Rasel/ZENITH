/**
 * Metrics Service Contracts (common Module — DIP/ISP foundation).
 *
 * Strict, segregated interfaces. Concrete providers live in
 * `../services/metrics/` and are bound to the tokens in
 * `../constants/metrics.tokens.ts`. Consumers MUST inject via tokens —
 * the legacy metrics façade was deleted in Step 4.
 *
 * The shared label types and the `BREAKER_STATE_VALUES` map are defined
 * here (the canonical home) so the providers depend on the contract
 * layer rather than each other.
 */

/**
 * Strict label types for HTTP, cache, and circuit-breaker counters.
 * ZERO TOLERANCE FOR `any`.
 */
export interface HttpMetricLabels {
  method: string;
  route: string;
  status: string;
}

export interface CacheMetricLabels {
  namespace: string;
}

export interface BreakerMetricLabels {
  name: string;
}

/**
 * Performance metrics summary DTO. Returned by
 * `IPerformanceMetricsReader.getPerformanceMetrics`.
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
 * Circuit-breaker event types — narrows the `event_type` label.
 */
export type BreakerEventType =
  | 'success'
  | 'failure'
  | 'timeout'
  | 'reject'
  | 'fallback';

/**
 * Numeric mapping for circuit-breaker state gauge.
 *
 * - CLOSED   (0)   = healthy
 * - HALF_OPEN(0.5) = recovery testing
 * - OPEN     (1)   = tripped — alertable on `state > 0`
 */
export const BREAKER_STATE_VALUES = {
  CLOSED: 0,
  HALF_OPEN: 0.5,
  OPEN: 1,
} as const;

export type CircuitBreakerStateValue =
  (typeof BREAKER_STATE_VALUES)[keyof typeof BREAKER_STATE_VALUES];

/**
 * Database pool stats snapshot, populated on every Prometheus scrape.
 * Mirrors the pg-pool internals exposed by TypeORM's pg driver.
 */
export interface DbPoolStats {
  total: number;
  idle: number;
  waiting: number;
}

/**
 * IHttpMetricsRecorder — HTTP request observation surface.
 * Owned by the timing interceptor; consumed nowhere else.
 */
export interface IHttpMetricsRecorder {
  recordHttpRequest(labels: HttpMetricLabels, durationSeconds: number): void;
}

/**
 * ICacheMetricsRecorder — cache hit/miss observation surface.
 * Consumed by every cache provider that reports hit-rate.
 */
export interface ICacheMetricsRecorder {
  recordCacheHit(namespace?: string): void;
  recordCacheMiss(namespace?: string): void;
}

/**
 * IDbPoolMetricsCollector — driver-pool sampling surface.
 * Concrete implementation will live in the `database` module
 * (rightful owner of the TypeORM `DataSource`); this contract
 * stays in `common` so the metrics composition layer wires it
 * without an upward import.
 */
export interface IDbPoolMetricsCollector {
  getPoolStats(): DbPoolStats;
}

/**
 * IIntegrationMetricsRecorder — third-party integration observation surface.
 */
export interface IIntegrationMetricsRecorder {
  recordSync(
    integrationType: string,
    status: 'success' | 'failure',
    durationSeconds: number,
  ): void;
  recordApiCall(
    integrationType: string,
    endpoint: string,
    statusCode: number,
    durationSeconds: number,
  ): void;
  recordTokenRefresh(
    integrationType: string,
    status: 'success' | 'failure',
    durationSeconds: number,
  ): void;
  setActiveIntegrations(integrationType: string, count: number): void;
  setIntegrationHealth(
    integrationId: string,
    integrationType: string,
    health: 'disconnected' | 'error' | 'warning' | 'healthy',
  ): void;
}

/**
 * ICircuitBreakerMetricsRecorder — opossum circuit-breaker observation surface.
 */
export interface ICircuitBreakerMetricsRecorder {
  setCircuitBreakerState(name: string, state: CircuitBreakerStateValue): void;
  recordCircuitBreakerEvent(name: string, eventType: BreakerEventType): void;
}

/**
 * IPerformanceMetricsReader — derived metrics summary surface.
 */
export interface IPerformanceMetricsReader {
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
}

/**
 * IPrometheusRegistry — raw registry exposure surface.
 * Consumed by `MetricsController` to serve `/metrics`.
 */
export interface IPrometheusRegistry {
  getMetrics(): Promise<string>;
  getMetricsJSON(): Promise<object[]>;
  getMetricsContentType(): string;
}
