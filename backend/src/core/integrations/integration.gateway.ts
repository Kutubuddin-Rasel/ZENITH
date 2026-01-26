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

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { AuditLogsService } from '../../audit/audit-logs.service';
import { RBACService } from '../../rbac/rbac.service';
import {
  MetricsService,
  BREAKER_STATE_VALUES,
  BreakerEventType,
} from '../../common/services/metrics.service';
import { CacheService } from '../../cache/cache.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Circuit state type for Redis persistence (Phase 5)
 * CLOSED vs OPEN. HALF_OPEN is transient and not persisted.
 */
export type CircuitState = 'OPEN' | 'CLOSED';

/**
 * Redis key prefix for circuit breaker state (Phase 5)
 * Format: circuit:{name}:state
 */
const REDIS_KEY_PREFIX = 'circuit' as const;
const REDIS_STATE_NAMESPACE = 'circuit_breaker_state' as const;

/**
 * TTL for circuit state in Redis (1 hour)
 * Failsafe: ensures state doesn't persist forever if app crashes
 */
const REDIS_STATE_TTL_SECONDS = 3600;

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

/**
 * Audit context for circuit breaker manual controls (Phase 2)
 * Used for tripBreaker and resetBreaker audit logging
 */
export interface CircuitAuditContext {
  /** User ID performing the action */
  userId: string;
  /** Role ID for RBAC permission check (Phase 3) */
  roleId: string;
  /** Reason for the manual intervention */
  reason: string;
  /** Optional tenant/organization ID */
  tenantId?: string;
}

/**
 * Circuit Breaker Permission Constants (Phase 3)
 *
 * STRICT TYPING: Using const enum avoids magic strings scattered in code.
 * All permission checks reference these typed constants.
 *
 * Format follows RBAC convention: "resource:action"
 */
export const CircuitBreakerPermissions = {
  /** Permission to manually trip or reset circuit breakers */
  MANAGE: 'circuit-breaker:manage',
} as const;

export type CircuitBreakerPermission =
  (typeof CircuitBreakerPermissions)[keyof typeof CircuitBreakerPermissions];

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

  constructor(
    @Optional() private readonly auditLogsService?: AuditLogsService,
    @Optional() private readonly rbacService?: RBACService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /**
   * Execute a function through a circuit breaker
   *
   * SINGLETON PATTERN (Phase 1 Fix):
   * Uses getOrCreateBreaker to get/create a SINGLE breaker per service name.
   * The breaker.fire(action) pattern allows different actions to share
   * the same circuit state (failure count, open/closed status).
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
    const breaker = this.getOrCreateBreaker(options, fallback);

    // Pass the action to fire() - this allows the SAME breaker instance
    // to execute DIFFERENT actions while maintaining shared state
    return breaker.fire(action) as Promise<T>;
  }

  /**
   * Get or create a circuit breaker for a service (SINGLETON PATTERN)
   *
   * CRITICAL FIX (Phase 1):
   * The previous implementation created a NEW breaker instance on every call,
   * even when one already existed. This defeated the entire circuit breaker
   * pattern because:
   * - Each request started with failure count = 0
   * - The circuit could NEVER open, even with 100% failures
   *
   * THE FIX:
   * 1. If breaker exists for this name → RETURN IT (don't create new)
   * 2. Create breakers with a placeholder action (the real action is passed to fire())
   * 3. First-creation-wins for configuration (subsequent calls reuse existing config)
   *
   * @param options - Breaker configuration (name is required)
   * @param fallback - Optional fallback (only registered on first creation)
   * @returns Existing or newly created CircuitBreaker instance
   */
  private getOrCreateBreaker<T>(
    options: BreakerOptions,
    fallback?: () => T | Promise<T>,
  ): CircuitBreaker {
    const { name } = options;

    // SINGLETON CHECK: Return existing breaker immediately
    // This is the critical fix - we MUST return the existing instance
    if (this.breakers.has(name)) {
      const existingBreaker = this.breakers.get(name)!;
      this.logger.debug(`Reusing existing circuit breaker: ${name}`);
      return existingBreaker;
    }

    // CREATE NEW: Only reach here on first call for this service name
    const breakerOptions = this.getBreakerOptions(options);

    // Create breaker with a placeholder action
    // The actual action is passed to fire() in the execute() method
    // This allows the same breaker to execute different functions
    const placeholderAction = (): Promise<unknown> => {
      return Promise.reject(
        new Error(`Circuit breaker ${name}: action must be passed to fire()`),
      );
    };

    const breaker = new CircuitBreaker(placeholderAction, breakerOptions);

    // Register fallback (only on first creation)
    if (fallback) {
      breaker.fallback(fallback);
    }

    // Event listeners for observability and metrics
    this.registerEventListeners(breaker, name);

    // PHASE 5: Attach Redis persistence listeners
    this.attachRedisStateListeners(breaker, name);

    // Store in registry
    this.breakers.set(name, breaker);
    this.logger.log(`Circuit breaker created for: ${name}`);

    // PHASE 5: Background hydration from Redis (async, fire-and-forget)
    // This syncs global state without blocking the sync constructor
    void this.hydrateFromRedis(breaker, name);

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
   * Register event listeners for monitoring and Prometheus metrics
   *
   * PHASE 4: Prometheus Integration
   * - State gauge: Updates on open/halfOpen/close events
   * - Event counter: Increments on success/failure/timeout/reject/fallback
   *
   * These listeners are attached ONCE during breaker creation (singleton pattern)
   */
  private registerEventListeners(breaker: CircuitBreaker, name: string): void {
    // STATE CHANGES - Update Prometheus gauge (Phase 4)
    breaker.on('open', () => {
      this.logger.warn(`🔴 Circuit OPEN: ${name} - requests will fail fast`);
      this.metricsService?.setCircuitBreakerState(
        name,
        BREAKER_STATE_VALUES.OPEN,
      );
    });

    breaker.on('halfOpen', () => {
      this.logger.log(`🟡 Circuit HALF-OPEN: ${name} - testing recovery`);
      this.metricsService?.setCircuitBreakerState(
        name,
        BREAKER_STATE_VALUES.HALF_OPEN,
      );
    });

    breaker.on('close', () => {
      this.logger.log(`🟢 Circuit CLOSED: ${name} - recovered`);
      this.metricsService?.setCircuitBreakerState(
        name,
        BREAKER_STATE_VALUES.CLOSED,
      );
    });

    // EVENT COUNTS - Increment Prometheus counter (Phase 4)
    breaker.on('success', () => {
      this.metricsService?.recordCircuitBreakerEvent(
        name,
        'success' as BreakerEventType,
      );
    });

    breaker.on('failure', () => {
      this.metricsService?.recordCircuitBreakerEvent(
        name,
        'failure' as BreakerEventType,
      );
    });

    breaker.on('timeout', () => {
      this.logger.warn(`⏱️ Timeout for: ${name}`);
      this.metricsService?.recordCircuitBreakerEvent(
        name,
        'timeout' as BreakerEventType,
      );
    });

    breaker.on('reject', () => {
      this.logger.debug(`❌ Request rejected (circuit open): ${name}`);
      this.metricsService?.recordCircuitBreakerEvent(
        name,
        'reject' as BreakerEventType,
      );
    });

    breaker.on('fallback', () => {
      this.logger.debug(`↩️ Fallback triggered for: ${name}`);
      this.metricsService?.recordCircuitBreakerEvent(
        name,
        'fallback' as BreakerEventType,
      );
    });

    // Initialize state gauge to CLOSED (default state)
    this.metricsService?.setCircuitBreakerState(
      name,
      BREAKER_STATE_VALUES.CLOSED,
    );
  }

  // ===========================================================================
  // PHASE 5: REDIS STATE PERSISTENCE FOR HIGH AVAILABILITY
  // ===========================================================================

  /**
   * Build Redis key for circuit breaker state.
   * Format: circuit:{name}:state
   */
  private buildRedisKey(name: string): string {
    return `${REDIS_KEY_PREFIX}:${name}:state`;
  }

  /**
   * Hydrate circuit breaker state from Redis (Phase 5)
   *
   * SYNC STRATEGY:
   * This method is called asynchronously (fire-and-forget) from getOrCreateBreaker.
   * Since getOrCreateBreaker must be sync, we accept a brief window where
   * the local state may not match Redis. This is acceptable because:
   * 1. The window is typically <10ms
   * 2. If Redis says OPEN, we immediately open the local breaker
   * 3. Failed hydration degrades gracefully (local-only operation)
   *
   * @param breaker - The circuit breaker instance to sync
   * @param name - The breaker name for Redis key
   */
  private async hydrateFromRedis(
    breaker: CircuitBreaker,
    name: string,
  ): Promise<void> {
    if (!this.cacheService) {
      this.logger.debug(
        `CacheService not available, skipping Redis hydration for: ${name}`,
      );
      return;
    }

    const key = this.buildRedisKey(name);

    try {
      const state = await this.cacheService.get<CircuitState>(key, {
        namespace: REDIS_STATE_NAMESPACE,
      });

      if (state === 'OPEN') {
        // Another instance has tripped this circuit - sync local state
        this.logger.warn(
          `🔴 Hydrating from Redis: Circuit '${name}' is OPEN globally`,
        );
        breaker.open();

        // Update local metrics to match
        this.metricsService?.setCircuitBreakerState(
          name,
          BREAKER_STATE_VALUES.OPEN,
        );
      } else {
        this.logger.debug(`Circuit '${name}' is CLOSED in Redis (or not set)`);
      }
    } catch (error: unknown) {
      // Graceful degradation: continue with local-only state
      this.logger.warn(
        `Failed to hydrate circuit '${name}' from Redis:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Attach Redis state persistence listeners (Phase 5)
   *
   * PROPAGATION STRATEGY:
   * - On 'open': Write OPEN state to Redis with TTL (for HA)
   * - On 'close': Delete state from Redis (circuit is healthy)
   * - Half-open is transient, not persisted (it's a local test state)
   *
   * All writes are fire-and-forget with .catch() to prevent crashes
   * if Redis is unavailable.
   *
   * @param breaker - The circuit breaker instance
   * @param name - The breaker name for Redis key
   */
  private attachRedisStateListeners(
    breaker: CircuitBreaker,
    name: string,
  ): void {
    if (!this.cacheService) {
      this.logger.debug(
        `CacheService not available, skipping Redis listeners for: ${name}`,
      );
      return;
    }

    const key = this.buildRedisKey(name);

    // On OPEN: Persist to Redis so other pods can see it
    breaker.on('open', () => {
      void this.persistCircuitState(key, 'OPEN', name);
    });

    // On CLOSE: Clear from Redis (healthy state is default)
    breaker.on('close', () => {
      void this.clearCircuitState(key, name);
    });

    // HALF_OPEN is transient - not persisted
    // If a half-open test succeeds → close is written
    // If a half-open test fails → open is written
  }

  /**
   * Persist circuit OPEN state to Redis with TTL
   *
   * @param key - Redis key
   * @param state - Circuit state to persist
   * @param name - Breaker name for logging
   */
  private async persistCircuitState(
    key: string,
    state: CircuitState,
    name: string,
  ): Promise<void> {
    try {
      await this.cacheService?.set(key, state, {
        ttl: REDIS_STATE_TTL_SECONDS,
        namespace: REDIS_STATE_NAMESPACE,
      });
      this.logger.debug(`Persisted circuit '${name}' state to Redis: ${state}`);
    } catch (error: unknown) {
      // Fire-and-forget: log but don't throw
      this.logger.warn(
        `Failed to persist circuit '${name}' to Redis:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Clear circuit state from Redis (on close)
   *
   * @param key - Redis key to delete
   * @param name - Breaker name for logging
   */
  private async clearCircuitState(key: string, name: string): Promise<void> {
    try {
      await this.cacheService?.del(key, {
        namespace: REDIS_STATE_NAMESPACE,
      });
      this.logger.debug(`Cleared circuit '${name}' state from Redis`);
    } catch (error: unknown) {
      // Fire-and-forget: log but don't throw
      this.logger.warn(
        `Failed to clear circuit '${name}' from Redis:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
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
   *
   * AUTHORIZATION (Phase 3):
   * Requires 'circuit-breaker:manage' permission.
   * Check happens BEFORE any state change or audit logging.
   *
   * AUDIT LOGGING (Phase 2):
   * Logs CIRCUIT_MANUALLY_TRIPPED event with severity HIGH.
   * Requires userId and reason for accountability.
   *
   * @param name - Circuit breaker name
   * @param context - Audit context with userId, roleId, and reason
   * @returns true if tripped, false if breaker not found
   * @throws ForbiddenException if user lacks permission
   */
  async tripBreaker(
    name: string,
    context: CircuitAuditContext,
  ): Promise<boolean> {
    // PHASE 3: Authorization check FIRST (before any state change)
    await this.checkCircuitBreakerPermission(context);

    const breaker = this.breakers.get(name);
    if (!breaker) {
      this.logger.warn(`Trip failed: breaker '${name}' not found`);
      return false;
    }

    // Perform the state change (operational priority)
    breaker.open();
    this.logger.warn(`Circuit manually tripped: ${name} by ${context.userId}`);

    // Audit log (resilient - state change succeeds even if logging fails)
    await this.logCircuitAudit('CIRCUIT_MANUALLY_TRIPPED', name, context, {
      previousState: 'CLOSED',
      newState: 'OPEN',
    });

    return true;
  }

  /**
   * Force a circuit closed (use with caution)
   *
   * AUTHORIZATION (Phase 3):
   * Requires 'circuit-breaker:manage' permission.
   * Check happens BEFORE any state change or audit logging.
   *
   * AUDIT LOGGING (Phase 2):
   * Logs CIRCUIT_MANUALLY_RESET event with severity HIGH.
   * Requires userId and reason for accountability.
   *
   * @param name - Circuit breaker name
   * @param context - Audit context with userId, roleId, and reason
   * @returns true if reset, false if breaker not found
   * @throws ForbiddenException if user lacks permission
   */
  async resetBreaker(
    name: string,
    context: CircuitAuditContext,
  ): Promise<boolean> {
    // PHASE 3: Authorization check FIRST (before any state change)
    await this.checkCircuitBreakerPermission(context);

    const breaker = this.breakers.get(name);
    if (!breaker) {
      this.logger.warn(`Reset failed: breaker '${name}' not found`);
      return false;
    }

    // Capture previous state for audit
    const previousState = this.getCircuitState(breaker);

    // Perform the state change (operational priority)
    breaker.close();
    this.logger.log(`Circuit manually reset: ${name} by ${context.userId}`);

    // Audit log (resilient - state change succeeds even if logging fails)
    await this.logCircuitAudit('CIRCUIT_MANUALLY_RESET', name, context, {
      previousState,
      newState: 'CLOSED',
    });

    return true;
  }

  /**
   * Check circuit breaker management permission (Phase 3)
   *
   * SECURITY STRATEGY: Service-Level Check
   * Unlike controller guards, this check is embedded IN the service.
   * This provides "Defense in Depth" - the check happens regardless of
   * whether the call comes via HTTP, WebSocket, or internal event.
   *
   * @param context - Contains roleId for permission lookup
   * @throws ForbiddenException if user lacks permission
   */
  private async checkCircuitBreakerPermission(
    context: CircuitAuditContext,
  ): Promise<void> {
    // Skip check if RBACService not available (dev mode / testing)
    if (!this.rbacService) {
      this.logger.debug('RBACService not available, skipping permission check');
      return;
    }

    const requiredPermission = CircuitBreakerPermissions.MANAGE;

    try {
      // Get all permissions for this role
      const permissions = await this.rbacService.getRolePermissions(
        context.roleId,
      );

      if (!permissions.includes(requiredPermission)) {
        this.logger.warn(
          `Authorization denied: User ${context.userId} (role: ${context.roleId}) ` +
            `lacks permission '${requiredPermission}'`,
        );
        throw new ForbiddenException(
          `Permission denied: requires '${requiredPermission}'`,
        );
      }

      this.logger.debug(
        `Authorization granted: User ${context.userId} has '${requiredPermission}'`,
      );
    } catch (error: unknown) {
      // Re-throw ForbiddenException, wrap others
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        'Permission check failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new ForbiddenException('Permission check failed');
    }
  }

  /**
   * Log circuit breaker audit event (Phase 2)
   *
   * RESILIENCE:
   * Wrapped in try-catch - operational state change succeeds
   * even if audit logging fails. Logs error but doesn't throw.
   */
  private async logCircuitAudit(
    action: 'CIRCUIT_MANUALLY_TRIPPED' | 'CIRCUIT_MANUALLY_RESET',
    breakerName: string,
    context: CircuitAuditContext,
    stateChange: { previousState: string; newState: string },
  ): Promise<void> {
    if (!this.auditLogsService) {
      this.logger.debug('AuditLogsService not available, skipping audit log');
      return;
    }

    try {
      await this.auditLogsService.log({
        event_uuid: uuidv4(),
        timestamp: new Date(),
        tenant_id: context.tenantId || 'system',
        actor_id: context.userId,
        resource_type: 'CircuitBreaker',
        resource_id: breakerName,
        action_type: 'UPDATE',
        action,
        metadata: {
          severity: 'HIGH',
          reason: context.reason,
          ...stateChange,
        },
      });
    } catch (error: unknown) {
      // Resilience: Don't fail the operation if audit logging fails
      this.logger.error(
        `Failed to log audit event for ${action}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
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
