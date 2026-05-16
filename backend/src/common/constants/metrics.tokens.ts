/**
 * Metrics DI Tokens.
 *
 * Symbol-based injection tokens for the segregated metrics contracts in
 * `../interfaces/metrics.interfaces.ts`. Symbols guarantee zero collision
 * across the application graph — string keys are forbidden because Nest
 * will conflate identical strings across unrelated providers.
 *
 * USAGE:
 *   constructor(
 *     @Inject(HTTP_METRICS_RECORDER_TOKEN)
 *     private readonly httpMetrics: IHttpMetricsRecorder,
 *   ) {}
 *
 * Each token binds to a focused provider extracted from the former
 * metrics god-class (and, for `DB_POOL_METRICS_COLLECTOR_TOKEN`, a
 * provider that lives in the `database` module).
 */

export const HTTP_METRICS_RECORDER_TOKEN: unique symbol = Symbol(
  'HTTP_METRICS_RECORDER_TOKEN',
);
export const CACHE_METRICS_RECORDER_TOKEN: unique symbol = Symbol(
  'CACHE_METRICS_RECORDER_TOKEN',
);
export const DB_POOL_METRICS_COLLECTOR_TOKEN: unique symbol = Symbol(
  'DB_POOL_METRICS_COLLECTOR_TOKEN',
);
export const INTEGRATION_METRICS_RECORDER_TOKEN: unique symbol = Symbol(
  'INTEGRATION_METRICS_RECORDER_TOKEN',
);
export const CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN: unique symbol = Symbol(
  'CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN',
);
export const PERFORMANCE_METRICS_READER_TOKEN: unique symbol = Symbol(
  'PERFORMANCE_METRICS_READER_TOKEN',
);
export const PROMETHEUS_REGISTRY_TOKEN: unique symbol = Symbol(
  'PROMETHEUS_REGISTRY_TOKEN',
);
