import { Injectable } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

type CacheOperation = 'get' | 'set' | 'del';

/**
 * CacheMetricsRecorder — single source of cache Prometheus metrics.
 *
 * Owns the three cache instruments so providers don't each register their
 * own (which would crash with "metric already registered" errors).
 *
 * CARDINALITY GUARDRAIL:
 *   Labels are intentionally limited to `namespace` and `operation`. Never add
 *   `key` as a label — that would create a cardinality explosion.
 */
@Injectable()
export class CacheMetricsRecorder {
  private readonly hitsCounter: Counter<'namespace'>;
  private readonly missesCounter: Counter<'namespace'>;
  private readonly operationDuration: Histogram<'operation'>;

  constructor() {
    this.hitsCounter =
      (register.getSingleMetric('cache_hits_total') as Counter<'namespace'>) ??
      new Counter({
        name: 'cache_hits_total',
        help: 'Total number of cache hits',
        labelNames: ['namespace'] as const,
        registers: [register],
      });

    this.missesCounter =
      (register.getSingleMetric(
        'cache_misses_total',
      ) as Counter<'namespace'>) ??
      new Counter({
        name: 'cache_misses_total',
        help: 'Total number of cache misses',
        labelNames: ['namespace'] as const,
        registers: [register],
      });

    this.operationDuration =
      (register.getSingleMetric(
        'cache_operation_duration_seconds',
      ) as Histogram<'operation'>) ??
      new Histogram({
        name: 'cache_operation_duration_seconds',
        help: 'Duration of cache operations in seconds',
        labelNames: ['operation'] as const,
        // Redis is fast — small buckets in seconds.
        buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
        registers: [register],
      });
  }

  recordHit(namespace = 'default'): void {
    this.hitsCounter.inc({ namespace });
  }

  recordMiss(namespace = 'default'): void {
    this.missesCounter.inc({ namespace });
  }

  startTimer(operation: CacheOperation): () => void {
    return this.operationDuration.startTimer({ operation });
  }
}
