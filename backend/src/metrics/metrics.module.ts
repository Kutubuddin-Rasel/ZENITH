/**
 * Metrics Module — Prometheus Telemetry for Zenith
 *
 * ARCHITECTURE:
 * Uses `prom-client` v15 directly (already installed) to expose a
 * `/metrics` endpoint for Kubernetes ServiceMonitor scraping.
 *
 * Components:
 * 1. MetricsController — `/metrics` endpoint (returns prom-client registry)
 * 2. HTTP Metric Providers — Counter + Histogram injected globally
 * 3. HttpMetricsMiddleware — captures request telemetry via `res.on('finish')`
 *
 * DEFAULT METRICS:
 * `prom-client.collectDefaultMetrics()` is called at module init,
 * providing Node.js process metrics (V8 heap, GC, event loop lag, etc.)
 * out of the box.
 *
 * SECURITY:
 * The `/metrics` endpoint is marked `@Public()` because Prometheus
 * cannot send JWT tokens. It is protected at the K8s network level
 * via ServiceMonitor (internal-only scraping).
 *
 * ZERO `any` TOLERANCE.
 */

import { Module, OnModuleInit } from '@nestjs/common';
import * as promClient from 'prom-client';
import { MetricsController } from './metrics.controller';
import {
  HTTP_REQUESTS_COUNTER,
  HTTP_DURATION_HISTOGRAM,
  httpRequestsCounter,
  httpDurationHistogram,
} from './http-metrics.providers';

@Module({
  controllers: [MetricsController],
  providers: [
    // Provide pre-configured metric instances for DI
    {
      provide: HTTP_REQUESTS_COUNTER,
      useValue: httpRequestsCounter,
    },
    {
      provide: HTTP_DURATION_HISTOGRAM,
      useValue: httpDurationHistogram,
    },
  ],
  exports: [HTTP_REQUESTS_COUNTER, HTTP_DURATION_HISTOGRAM],
})
export class MetricsModule implements OnModuleInit {
  onModuleInit(): void {
    // Enable default Node.js/V8 metrics:
    // - process_cpu_seconds_total
    // - process_resident_memory_bytes
    // - nodejs_heap_size_total_bytes
    // - nodejs_gc_duration_seconds
    // - nodejs_eventloop_lag_seconds
    promClient.collectDefaultMetrics({
      prefix: 'zenith_',
    });
  }
}
