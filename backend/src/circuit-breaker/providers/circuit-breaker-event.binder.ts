import { Inject, Injectable, Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN } from '../../common/constants/metrics.tokens';
import {
  BREAKER_STATE_VALUES,
  type BreakerEventType,
  type ICircuitBreakerMetricsRecorder,
} from '../../common/interfaces/metrics.interfaces';

/**
 * CircuitBreakerEventBinder
 *
 * Wires opossum lifecycle events (open / halfOpen / close + success /
 * failure / timeout / reject / fallback) into the Prometheus metrics
 * recorder. Pure registration logic: stateless, no behavior beyond
 * forwarding events into the metrics surface.
 *
 * Lives inside the circuit-breaker module so the orchestrator never
 * imports a concrete metrics class — the contract is the
 * `ICircuitBreakerMetricsRecorder` interface bound at the observability
 * boundary.
 *
 * STRICT DI: the metrics recorder is mandatory. Boot fails fast if the
 * observability module is not wired — operational visibility is not an
 * optional concern for production infrastructure.
 */
@Injectable()
export class CircuitBreakerEventBinder {
  private readonly logger = new Logger(CircuitBreakerEventBinder.name);

  constructor(
    @Inject(CIRCUIT_BREAKER_METRICS_RECORDER_TOKEN)
    private readonly breakerMetrics: ICircuitBreakerMetricsRecorder,
  ) {}

  /**
   * Attach all metric-emitting listeners to a freshly created breaker.
   * MUST be called exactly once per breaker (singleton creation path).
   */
  bind(breaker: CircuitBreaker, name: string): void {
    breaker.on('open', () => {
      this.logger.warn(`🔴 Circuit OPEN: ${name} - requests will fail fast`);
      this.breakerMetrics.setCircuitBreakerState(
        name,
        BREAKER_STATE_VALUES.OPEN,
      );
    });

    breaker.on('halfOpen', () => {
      this.logger.log(`🟡 Circuit HALF-OPEN: ${name} - testing recovery`);
      this.breakerMetrics.setCircuitBreakerState(
        name,
        BREAKER_STATE_VALUES.HALF_OPEN,
      );
    });

    breaker.on('close', () => {
      this.logger.log(`🟢 Circuit CLOSED: ${name} - recovered`);
      this.breakerMetrics.setCircuitBreakerState(
        name,
        BREAKER_STATE_VALUES.CLOSED,
      );
    });

    breaker.on('success', () => {
      this.breakerMetrics.recordCircuitBreakerEvent(
        name,
        'success' satisfies BreakerEventType,
      );
    });

    breaker.on('failure', () => {
      this.breakerMetrics.recordCircuitBreakerEvent(
        name,
        'failure' satisfies BreakerEventType,
      );
    });

    breaker.on('timeout', () => {
      this.logger.warn(`⏱️ Timeout for: ${name}`);
      this.breakerMetrics.recordCircuitBreakerEvent(
        name,
        'timeout' satisfies BreakerEventType,
      );
    });

    breaker.on('reject', () => {
      this.logger.debug(`❌ Request rejected (circuit open): ${name}`);
      this.breakerMetrics.recordCircuitBreakerEvent(
        name,
        'reject' satisfies BreakerEventType,
      );
    });

    breaker.on('fallback', () => {
      this.logger.debug(`↩️ Fallback triggered for: ${name}`);
      this.breakerMetrics.recordCircuitBreakerEvent(
        name,
        'fallback' satisfies BreakerEventType,
      );
    });

    this.breakerMetrics.setCircuitBreakerState(
      name,
      BREAKER_STATE_VALUES.CLOSED,
    );
  }
}
