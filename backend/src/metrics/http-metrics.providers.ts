/**
 * HTTP Metric Providers — Strictly Typed Prometheus Metrics
 *
 * CARDINALITY CONTROL:
 * Labels are strictly typed as `HttpMetricLabelNames` = 'method' | 'route' | 'status_code'.
 * TypeScript enforces this at compile time — impossible to accidentally add
 * `projectId` or `userId` which would cause cardinality explosion:
 * 10K projects × 5 methods × 20 status_codes = 1M time-series = Prometheus OOM.
 *
 * HISTOGRAM BUCKETS:
 * Tuned for a fast REST API with p99 target < 500ms:
 * [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
 *   5ms–100ms  → cached reads, simple queries
 *   250ms–1s   → complex DB queries, aggregations
 *   2.5s–10s   → slow exports, report generation
 *   >10s       → counted in +Inf bucket (alert trigger)
 *
 * ZERO `any` TOLERANCE.
 */

import { Counter, Histogram } from 'prom-client';

// ---------------------------------------------------------------------------
// Strict Label Typing — Cardinality Firewall
// ---------------------------------------------------------------------------

/**
 * Strictly allowed label names for HTTP metrics.
 * Adding a new label requires changing this type — making cardinality
 * impact a deliberate, reviewable decision.
 */
type HttpMetricLabelNames = 'method' | 'route' | 'status_code';

// ---------------------------------------------------------------------------
// DI Injection Tokens
// ---------------------------------------------------------------------------

/** Injection token for http_requests_total Counter */
export const HTTP_REQUESTS_COUNTER = Symbol('HTTP_REQUESTS_COUNTER');

/** Injection token for http_request_duration_seconds Histogram */
export const HTTP_DURATION_HISTOGRAM = Symbol('HTTP_DURATION_HISTOGRAM');

// ---------------------------------------------------------------------------
// Metric Instances (registered once at module load)
// ---------------------------------------------------------------------------

/**
 * Total HTTP requests counter.
 *
 * Labels:
 * - method: HTTP verb (GET, POST, PUT, DELETE, PATCH)
 * - route: NestJS route template (/api/projects/:projectId) — NOT raw URL
 * - status_code: HTTP response code (200, 404, 500)
 */
export const httpRequestsCounter = new Counter<HttpMetricLabelNames>({
  name: 'zenith_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

/**
 * HTTP request duration histogram.
 *
 * BUCKET DESIGN (seconds):
 * [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
 *
 * Coverage:
 * - p50 for cached reads: ~5-25ms
 * - p95 for DB queries: ~100-250ms
 * - p99 for complex operations: ~500ms-1s
 * - Slow outliers (exports): 2.5-10s
 */
export const httpDurationHistogram = new Histogram<HttpMetricLabelNames>({
  name: 'zenith_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
