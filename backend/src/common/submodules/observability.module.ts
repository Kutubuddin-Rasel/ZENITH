import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import {
  CACHE_METRICS_RECORDER_TOKEN,
  CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN,
  DB_POOL_METRICS_COLLECTOR_TOKEN,
  HTTP_METRICS_RECORDER_TOKEN,
  INTEGRATION_METRICS_RECORDER_TOKEN,
  PERFORMANCE_METRICS_READER_TOKEN,
  PROMETHEUS_REGISTRY_TOKEN,
} from '../constants/metrics.tokens';
import { CacheMetricsRecorder } from '../services/metrics/cache-metrics.recorder';
import { CircuitBreakerMetricsRecorder } from '../services/metrics/circuit-breaker-metrics.recorder';
import { DbPoolMetricsCollector } from '../services/metrics/db-pool-metrics.collector';
import { HttpMetricsRecorder } from '../services/metrics/http-metrics.recorder';
import { IntegrationMetricsRecorder } from '../services/metrics/integration-metrics.recorder';
import { PerformanceMetricsReader } from '../services/metrics/performance-metrics.reader';
import { PrometheusRegistryProvider } from '../services/metrics/prometheus-registry.provider';
import { TimingInterceptor } from '../interceptors/timing.interceptor';

/**
 * CommonObservabilityModule
 *
 * Aggregates the seven SRP-decomposed metric providers and binds each
 * to its segregated token. Step 4 migrated every consumer to inject the
 * focused token it actually needs (HTTP, cache, integration, circuit
 * breaker, etc.) and the legacy metrics façade has been deleted.
 *
 * NOTE: The route-level `MetricsController` (`/metrics`, `/metrics/json`)
 * lives in `src/observability/observability.module.ts`, not here.
 * This submodule provides the *infrastructure*; the top-level module
 * provides the HTTP exposure.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    PrometheusRegistryProvider,
    HttpMetricsRecorder,
    CacheMetricsRecorder,
    DbPoolMetricsCollector,
    IntegrationMetricsRecorder,
    CircuitBreakerMetricsRecorder,
    PerformanceMetricsReader,
    {
      provide: PROMETHEUS_REGISTRY_TOKEN,
      useExisting: PrometheusRegistryProvider,
    },
    { provide: HTTP_METRICS_RECORDER_TOKEN, useExisting: HttpMetricsRecorder },
    {
      provide: CACHE_METRICS_RECORDER_TOKEN,
      useExisting: CacheMetricsRecorder,
    },
    {
      provide: DB_POOL_METRICS_COLLECTOR_TOKEN,
      useExisting: DbPoolMetricsCollector,
    },
    {
      provide: INTEGRATION_METRICS_RECORDER_TOKEN,
      useExisting: IntegrationMetricsRecorder,
    },
    {
      provide: CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN,
      useExisting: CircuitBreakerMetricsRecorder,
    },
    {
      provide: PERFORMANCE_METRICS_READER_TOKEN,
      useExisting: PerformanceMetricsReader,
    },
    TimingInterceptor,
  ],
  exports: [
    PROMETHEUS_REGISTRY_TOKEN,
    HTTP_METRICS_RECORDER_TOKEN,
    CACHE_METRICS_RECORDER_TOKEN,
    DB_POOL_METRICS_COLLECTOR_TOKEN,
    INTEGRATION_METRICS_RECORDER_TOKEN,
    CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN,
    PERFORMANCE_METRICS_READER_TOKEN,
    TimingInterceptor,
  ],
})
export class CommonObservabilityModule {}
