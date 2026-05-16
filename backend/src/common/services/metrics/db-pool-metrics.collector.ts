import { Injectable, Logger, Optional } from '@nestjs/common';
import { Gauge, register } from 'prom-client';
import { DataSource } from 'typeorm';
import type {
  DbPoolStats,
  IDbPoolMetricsCollector,
} from '../../interfaces/metrics.interfaces';

interface DriverPool {
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
}
interface TypeORMDriver {
  master?: { pool?: DriverPool };
  pool?: DriverPool;
}

/**
 * DbPoolMetricsCollector
 *
 * SRP: Reads pg-pool stats from the TypeORM `DataSource` and exposes
 * them via three Prometheus gauges that sample on every scrape.
 *
 * `DataSource` is `@Optional()` so unit tests and isolated module loads
 * fall back to zero-stats without throwing.
 *
 * Lives in `common/` for now to keep the metrics composition layer
 * cohesive; a follow-up step will relocate it under the `database`
 * module (the rightful owner of `DataSource`) without changing the
 * `IDbPoolMetricsCollector` contract.
 */
@Injectable()
export class DbPoolMetricsCollector implements IDbPoolMetricsCollector {
  private readonly logger = new Logger(DbPoolMetricsCollector.name);

  constructor(@Optional() private readonly dataSource?: DataSource) {
    const totalGauge: Gauge<string> =
      (register.getSingleMetric('db_pool_total') as
        | Gauge<string>
        | undefined) ??
      new Gauge<string>({
        name: 'db_pool_total',
        help: 'Total number of connections in the database pool',
        registers: [register],
        collect: () => totalGauge.set(this.getPoolStats().total),
      });

    const idleGauge: Gauge<string> =
      (register.getSingleMetric('db_pool_idle') as Gauge<string> | undefined) ??
      new Gauge<string>({
        name: 'db_pool_idle',
        help: 'Number of idle connections in the database pool',
        registers: [register],
        collect: () => idleGauge.set(this.getPoolStats().idle),
      });

    const waitingGauge: Gauge<string> =
      (register.getSingleMetric('db_pool_waiting') as
        | Gauge<string>
        | undefined) ??
      new Gauge<string>({
        name: 'db_pool_waiting',
        help: 'Number of clients waiting for a database connection',
        registers: [register],
        collect: () => waitingGauge.set(this.getPoolStats().waiting),
      });
  }

  getPoolStats(): DbPoolStats {
    try {
      if (!this.dataSource || !this.dataSource.isInitialized) {
        return { total: 0, idle: 0, waiting: 0 };
      }
      const driver = this.dataSource.driver as TypeORMDriver;
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
}
