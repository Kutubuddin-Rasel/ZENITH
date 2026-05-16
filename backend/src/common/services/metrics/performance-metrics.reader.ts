import { Injectable, Logger } from '@nestjs/common';
import { Counter, register } from 'prom-client';
import type {
  IPerformanceMetricsReader,
  PerformanceMetrics,
} from '../../interfaces/metrics.interfaces';

/**
 * PerformanceMetricsReader
 *
 * SRP: Reads existing counter values out of the global registry and
 * derives hit/error rates. Owns no instruments — the recorders own those.
 * If a counter is not registered yet (e.g., service started but never
 * recorded), values default to zero.
 */
@Injectable()
export class PerformanceMetricsReader implements IPerformanceMetricsReader {
  private readonly logger = new Logger(PerformanceMetricsReader.name);

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const hits = await this.sumCounter('cache_hits_total');
      const misses = await this.sumCounter('cache_misses_total');
      const totalRequests = await this.sumCounter('http_requests_total');
      const totalErrors = await this.sumCounter('http_errors_total');

      const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
      const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

      return {
        cache: {
          hits,
          misses,
          hitRate: Math.round(hitRate * 10000) / 10000,
        },
        http: {
          totalRequests,
          totalErrors,
          errorRate: Math.round(errorRate * 10000) / 10000,
        },
      };
    } catch (error: unknown) {
      this.logger.error(
        'Failed to get performance metrics:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return {
        cache: { hits: 0, misses: 0, hitRate: 0 },
        http: { totalRequests: 0, totalErrors: 0, errorRate: 0 },
      };
    }
  }

  private async sumCounter(name: string): Promise<number> {
    const metric = register.getSingleMetric(name) as Counter | undefined;
    if (!metric) return 0;
    const snapshot = await metric.get();
    return snapshot.values.reduce((sum, v) => sum + v.value, 0);
  }
}
