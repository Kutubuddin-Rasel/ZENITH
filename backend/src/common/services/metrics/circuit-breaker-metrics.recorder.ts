import { Injectable } from '@nestjs/common';
import { Counter, Gauge, register } from 'prom-client';
import type {
  BreakerEventType,
  CircuitBreakerStateValue,
  ICircuitBreakerMetricsRecorder,
} from '../../interfaces/metrics.interfaces';

/**
 * CircuitBreakerMetricsRecorder
 *
 * SRP: Owns ONLY the opossum circuit-breaker state gauge and event counter.
 *
 * State gauge values: 0 = CLOSED (healthy), 0.5 = HALF_OPEN, 1 = OPEN.
 * The numeric mapping intentionally enables a single Grafana alert rule:
 * `circuit_breaker_state > 0`.
 */
@Injectable()
export class CircuitBreakerMetricsRecorder implements ICircuitBreakerMetricsRecorder {
  private readonly stateGauge: Gauge;
  private readonly eventsCounter: Counter;

  constructor() {
    this.stateGauge =
      (register.getSingleMetric('circuit_breaker_state') as Gauge) ??
      new Gauge({
        name: 'circuit_breaker_state',
        help: 'Current state of circuit breaker (0=CLOSED, 0.5=HALF_OPEN, 1=OPEN)',
        labelNames: ['name'],
        registers: [register],
      });
    this.eventsCounter =
      (register.getSingleMetric('circuit_breaker_events_total') as Counter) ??
      new Counter({
        name: 'circuit_breaker_events_total',
        help: 'Total circuit breaker events',
        labelNames: ['name', 'event_type'],
        registers: [register],
      });
  }

  setCircuitBreakerState(name: string, state: CircuitBreakerStateValue): void {
    this.stateGauge.set({ name }, state);
  }

  recordCircuitBreakerEvent(name: string, eventType: BreakerEventType): void {
    this.eventsCounter.inc({ name, event_type: eventType });
  }
}
