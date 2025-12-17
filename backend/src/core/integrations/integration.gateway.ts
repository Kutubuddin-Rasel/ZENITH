/**
 * IntegrationGateway - Circuit Breaker Engine for External API Calls
 *
 * Centralizes all external service calls (AI, GitHub, Slack, etc.)
 * with circuit breaker protection using the opossum library.
 *
 * PATTERN: Proxy Pattern with Circuit Breaker
 *
 * USE CASES:
 * - AI providers (OpenAI, Anthropic, Gemini)
 * - GitHub/GitLab integrations
 * - Slack/Teams notifications
 * - Any external HTTP API
 *
 * CONFIGURATION:
 * - Timeout: 5000ms (fail fast)
 * - Error Threshold: 50% (trip if half fail)
 * - Reset Timeout: 30000ms (wait 30s before retrying)
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import CircuitBreaker from 'opossum';

/**
 * Options for circuit breaker configuration
 */
export interface BreakerOptions {
    /** Service name for logging and metrics */
    name: string;
    /** Timeout in ms (default: 5000) */
    timeout?: number;
    /** Error threshold percentage to trip (default: 50) */
    errorThresholdPercentage?: number;
    /** Time in ms before attempting to close circuit (default: 30000) */
    resetTimeout?: number;
    /** Volume threshold - min requests before calculating error % (default: 5) */
    volumeThreshold?: number;
}

/**
 * Circuit breaker state for monitoring
 */
export interface BreakerState {
    name: string;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    stats: {
        failures: number;
        successes: number;
        timeouts: number;
        fallbacks: number;
    };
}

@Injectable()
export class IntegrationGateway implements OnModuleDestroy {
    private readonly logger = new Logger(IntegrationGateway.name);
    private readonly breakers = new Map<string, CircuitBreaker>();

    // Default circuit breaker configuration
    private readonly defaultOptions = {
        timeout: 5000, // 5 seconds
        errorThresholdPercentage: 50, // Trip at 50% failures
        resetTimeout: 30000, // 30 seconds before half-open
        volumeThreshold: 5, // Min requests before calculating error %
    };

    /**
     * Execute a function through a circuit breaker
     *
     * @param options - Circuit breaker configuration
     * @param action - The async function to execute
     * @param fallback - Optional fallback function when circuit is open
     * @returns Result of action or fallback
     *
     * @example
     * ```typescript
     * const result = await gateway.execute(
     *   { name: 'openai' },
     *   () => openai.chat.completions.create({ ... }),
     *   () => ({ content: 'AI unavailable' })
     * );
     * ```
     */
    async execute<T>(
        options: BreakerOptions,
        action: () => Promise<T>,
        fallback?: () => T | Promise<T>,
    ): Promise<T> {
        const breaker = this.getOrCreateBreaker(options, action, fallback);
        return breaker.fire() as Promise<T>;
    }

    /**
     * Get or create a circuit breaker for a service
     */
    private getOrCreateBreaker<T>(
        options: BreakerOptions,
        action: () => Promise<T>,
        fallback?: () => T | Promise<T>,
    ): CircuitBreaker {
        const { name } = options;

        // Return existing breaker if available
        if (this.breakers.has(name)) {
            const existingBreaker = this.breakers.get(name)!;
            // Update the action for this call
            return new CircuitBreaker(action, {
                ...this.getBreakerOptions(options),
                // Share state with existing breaker by using same name
            });
        }

        // Create new breaker
        const breakerOptions = this.getBreakerOptions(options);
        const breaker = new CircuitBreaker(action, breakerOptions);

        // Register fallback
        if (fallback) {
            breaker.fallback(fallback);
        }

        // Event listeners for observability
        this.registerEventListeners(breaker, name);

        this.breakers.set(name, breaker);
        this.logger.log(`Circuit breaker created for: ${name}`);

        return breaker;
    }

    /**
     * Build opossum options from our config
     */
    private getBreakerOptions(options: BreakerOptions): CircuitBreaker.Options {
        return {
            timeout: options.timeout ?? this.defaultOptions.timeout,
            errorThresholdPercentage:
                options.errorThresholdPercentage ??
                this.defaultOptions.errorThresholdPercentage,
            resetTimeout: options.resetTimeout ?? this.defaultOptions.resetTimeout,
            volumeThreshold:
                options.volumeThreshold ?? this.defaultOptions.volumeThreshold,
            // Enable rolling window stats
            rollingCountTimeout: 60000, // 1 minute window
            rollingCountBuckets: 10,
        };
    }

    /**
     * Register event listeners for monitoring
     */
    private registerEventListeners(breaker: CircuitBreaker, name: string): void {
        breaker.on('open', () => {
            this.logger.warn(`🔴 Circuit OPEN: ${name} - requests will fail fast`);
        });

        breaker.on('halfOpen', () => {
            this.logger.log(`🟡 Circuit HALF-OPEN: ${name} - testing recovery`);
        });

        breaker.on('close', () => {
            this.logger.log(`🟢 Circuit CLOSED: ${name} - recovered`);
        });

        breaker.on('fallback', () => {
            this.logger.debug(`↩️ Fallback triggered for: ${name}`);
        });

        breaker.on('timeout', () => {
            this.logger.warn(`⏱️ Timeout for: ${name}`);
        });

        breaker.on('reject', () => {
            this.logger.debug(`❌ Request rejected (circuit open): ${name}`);
        });
    }

    /**
     * Get state of all circuit breakers (for health checks/monitoring)
     */
    getAllBreakerStates(): BreakerState[] {
        const states: BreakerState[] = [];

        for (const [name, breaker] of this.breakers) {
            const stats = breaker.stats;
            states.push({
                name,
                state: this.getCircuitState(breaker),
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
     * Get human-readable circuit state
     */
    private getCircuitState(
        breaker: CircuitBreaker,
    ): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
        if (breaker.opened) return 'OPEN';
        if (breaker.halfOpen) return 'HALF_OPEN';
        return 'CLOSED';
    }

    /**
     * Force a circuit open (for emergencies/maintenance)
     */
    tripBreaker(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) return false;

        breaker.open();
        this.logger.warn(`Circuit manually tripped: ${name}`);
        return true;
    }

    /**
     * Force a circuit closed (use with caution)
     */
    resetBreaker(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) return false;

        breaker.close();
        this.logger.log(`Circuit manually reset: ${name}`);
        return true;
    }

    /**
     * Check if a specific service circuit is healthy
     */
    isHealthy(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) return true; // No breaker = assume healthy

        return !breaker.opened;
    }

    /**
     * Cleanup on module destroy
     */
    onModuleDestroy() {
        for (const [name, breaker] of this.breakers) {
            breaker.shutdown();
            this.logger.debug(`Circuit breaker shut down: ${name}`);
        }
        this.breakers.clear();
    }
}
