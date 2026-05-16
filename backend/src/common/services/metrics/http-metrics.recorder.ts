import { Injectable } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';
import type {
  HttpMetricLabels,
  IHttpMetricsRecorder,
} from '../../interfaces/metrics.interfaces';

/**
 * HttpMetricsRecorder
 *
 * SRP: Owns ONLY the HTTP request/duration/error counters and the
 * `recordHttpRequest` write API. Status codes ≥ 400 are also tallied
 * into `http_errors_total` so error-rate dashboards do not need to
 * re-aggregate per-status counters.
 *
 * Counter values are read by `PerformanceMetricsReader` via
 * `register.getSingleMetric(...)` — keeps the recorder focused on writes.
 */
@Injectable()
export class HttpMetricsRecorder implements IHttpMetricsRecorder {
  private readonly httpRequestsCounter: Counter;
  private readonly httpRequestDuration: Histogram;
  private readonly httpErrorsCounter: Counter;

  constructor() {
    this.httpRequestsCounter =
      (register.getSingleMetric('http_requests_total') as Counter) ??
      new Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status'],
        registers: [register],
      });

    this.httpRequestDuration =
      (register.getSingleMetric(
        'http_request_duration_seconds',
      ) as Histogram) ??
      new Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route'],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [register],
      });

    this.httpErrorsCounter =
      (register.getSingleMetric('http_errors_total') as Counter) ??
      new Counter({
        name: 'http_errors_total',
        help: 'Total number of HTTP errors (4xx and 5xx responses)',
        labelNames: ['method', 'route', 'status'],
        registers: [register],
      });
  }

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

    const statusCode = parseInt(labels.status, 10);
    if (statusCode >= 400) {
      this.httpErrorsCounter.inc({
        method: labels.method,
        route: labels.route,
        status: labels.status,
      });
    }
  }
}
