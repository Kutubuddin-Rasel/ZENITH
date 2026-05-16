import { Injectable } from '@nestjs/common';
import { Counter, register } from 'prom-client';
import type { ICacheMetricsRecorder } from '../../interfaces/metrics.interfaces';

/**
 * CacheMetricsRecorder
 *
 * SRP: Owns ONLY the cache hit/miss counters. Hit rate is derived
 * downstream by `PerformanceMetricsReader`.
 *
 * Idempotent counter creation: on hot-reload or duplicate module
 * registration, `register.getSingleMetric` returns the existing counter
 * instead of throwing on duplicate metric name.
 */
@Injectable()
export class CacheMetricsRecorder implements ICacheMetricsRecorder {
  private readonly cacheHitsCounter: Counter;
  private readonly cacheMissesCounter: Counter;

  constructor() {
    this.cacheHitsCounter =
      (register.getSingleMetric('cache_hits_total') as Counter) ??
      new Counter({
        name: 'cache_hits_total',
        help: 'Total number of cache hits',
        labelNames: ['namespace'],
        registers: [register],
      });

    this.cacheMissesCounter =
      (register.getSingleMetric('cache_misses_total') as Counter) ??
      new Counter({
        name: 'cache_misses_total',
        help: 'Total number of cache misses',
        labelNames: ['namespace'],
        registers: [register],
      });
  }

  recordCacheHit(namespace: string = 'default'): void {
    this.cacheHitsCounter.inc({ namespace });
  }

  recordCacheMiss(namespace: string = 'default'): void {
    this.cacheMissesCounter.inc({ namespace });
  }
}
