import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import type {
  BreakerOptions,
  BreakerState,
  ICircuitBreakerExecutor,
  ICircuitBreakerRegistry,
} from '../interfaces/circuit-breaker.interfaces';
import { CircuitBreakerEventBinder } from './circuit-breaker-event.binder';
import { RedisCircuitStateSync } from './redis-circuit-state-sync';

/**
 * CircuitBreakerOrchestrator
 *
 * SRP: owns the breaker registry (a Map keyed by service name) and
 * implements the two narrow consumer-facing contracts:
 *   - `ICircuitBreakerExecutor`  → `execute<T>(...)`
 *   - `ICircuitBreakerRegistry`  → `isHealthy(...)`, `getAllBreakerStates(...)`
 *
 * Composition (DIP): cross-cutting concerns are delegated to colocated
 * providers — metrics wiring to `CircuitBreakerEventBinder`, Redis
 * persistence to `RedisCircuitStateSync`. The orchestrator itself
 * imports neither metrics nor cache clients.
 *
 * Breaker creation follows a strict singleton-per-name pattern: each
 * unique `options.name` produces exactly one `opossum` instance whose
 * configuration is locked on first creation.
 */
@Injectable()
export class CircuitBreakerOrchestrator
  implements ICircuitBreakerExecutor, ICircuitBreakerRegistry, OnModuleDestroy
{
  private readonly logger = new Logger(CircuitBreakerOrchestrator.name);
  private readonly breakers = new Map<string, CircuitBreaker>();

  private readonly defaultOptions = {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
  } as const;

  constructor(
    private readonly eventBinder: CircuitBreakerEventBinder,
    private readonly stateSync: RedisCircuitStateSync,
  ) {}

  async execute<T>(
    options: BreakerOptions,
    action: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    const breaker = this.getOrCreate(options, fallback);
    return breaker.fire(action) as Promise<T>;
  }

  isHealthy(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return true;
    return !breaker.opened;
  }

  getAllBreakerStates(): BreakerState[] {
    const states: BreakerState[] = [];
    for (const [name, breaker] of this.breakers) {
      const stats = breaker.stats;
      states.push({
        name,
        state: this.snapshotState(breaker),
        stats: {
          failures: stats.failures,
          successes: stats.successes,
          timeouts: stats.timeouts,
          fallbacks: stats.fallbacks,
        },
      });
    }
    return states;
  }

  /**
   * Internal accessor for the control plane. Not part of any exported
   * interface — only the colocated `CircuitBreakerControlPlane`
   * resolves it (intra-module composition).
   */
  getBreakerHandle(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Internal helper for the control plane to capture a breaker's
   * human-readable state before mutating it.
   */
  snapshotState(breaker: CircuitBreaker): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (breaker.opened) return 'OPEN';
    if (breaker.halfOpen) return 'HALF_OPEN';
    return 'CLOSED';
  }

  onModuleDestroy(): void {
    for (const [name, breaker] of this.breakers) {
      breaker.shutdown();
      this.logger.debug(`Circuit breaker shut down: ${name}`);
    }
    this.breakers.clear();
  }

  private getOrCreate<T>(
    options: BreakerOptions,
    fallback?: () => T | Promise<T>,
  ): CircuitBreaker {
    const { name } = options;

    const existing = this.breakers.get(name);
    if (existing) {
      this.logger.debug(`Reusing existing circuit breaker: ${name}`);
      return existing;
    }

    const breakerOptions: CircuitBreaker.Options = {
      timeout: options.timeout ?? this.defaultOptions.timeout,
      errorThresholdPercentage:
        options.errorThresholdPercentage ??
        this.defaultOptions.errorThresholdPercentage,
      resetTimeout: options.resetTimeout ?? this.defaultOptions.resetTimeout,
      volumeThreshold:
        options.volumeThreshold ?? this.defaultOptions.volumeThreshold,
      rollingCountTimeout: 60000,
      rollingCountBuckets: 10,
    };

    const placeholderAction = (): Promise<unknown> =>
      Promise.reject(
        new Error(`Circuit breaker ${name}: action must be passed to fire()`),
      );

    const breaker = new CircuitBreaker(placeholderAction, breakerOptions);

    if (fallback) {
      breaker.fallback(fallback);
    }

    this.eventBinder.bind(breaker, name);
    this.stateSync.attach(breaker, name);

    this.breakers.set(name, breaker);
    this.logger.log(`Circuit breaker created for: ${name}`);

    void this.stateSync.hydrate(breaker, name);

    return breaker;
  }
}
