/**
 * Circuit Breaker Module — DIP/ISP Contracts
 *
 * Strict, segregated interfaces consumed by the engine and bound through
 * the tokens declared in `../constants/circuit-breaker.tokens.ts`.
 *
 * Adapters for cross-domain dependencies (RBAC, audit) live in their
 * owning modules under `*\/adapters/` — the breaker module never imports
 * a concrete domain service.
 *
 * ZERO TOLERANCE FOR `any`.
 */

/**
 * BreakerOptions — opossum configuration for a single circuit.
 */
export interface BreakerOptions {
  name: string;
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

/**
 * Snapshot of a circuit's runtime state. Returned by the registry.
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
 * State-change descriptor passed to the audit logger.
 */
export interface CircuitStateChange {
  previousState: string;
  newState: string;
}

/**
 * Operator context for manual trip/reset operations.
 *
 * `principalId` is opaque to this layer — the infrastructure module
 * never knows whether it represents a role, user, or composite
 * identifier. Resolution to a concrete authorization model is the
 * responsibility of the `IPermissionChecker` adapter bound at the
 * RBAC boundary.
 */
export interface CircuitAuditContext {
  userId: string;
  principalId: string;
  reason: string;
  tenantId?: string;
}

/**
 * ICircuitBreakerExecutor — narrow execution surface.
 *
 * Consumed by every domain caller (AI providers, alerting transports,
 * cache store). The 90% case of the public API; isolating it from the
 * registry and control-plane surfaces enforces ISP.
 */
export interface ICircuitBreakerExecutor {
  execute<T>(
    options: BreakerOptions,
    action: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T>;
}

/**
 * ICircuitBreakerRegistry — health/inspection surface.
 *
 * Consumed by health endpoints, dashboards, and short-circuit checks
 * (e.g. the AI provider's `isHealthy` gate).
 */
export interface ICircuitBreakerRegistry {
  isHealthy(name: string): boolean;
  getAllBreakerStates(): BreakerState[];
}

/**
 * ICircuitBreakerControlPlane — manual operational override surface.
 *
 * Consumed by admin controllers only. Permission enforcement is the
 * implementer's responsibility (defense-in-depth at the service layer).
 */
export interface ICircuitBreakerControlPlane {
  tripBreaker(name: string, context: CircuitAuditContext): Promise<boolean>;
  resetBreaker(name: string, context: CircuitAuditContext): Promise<boolean>;
}

/**
 * ICircuitAuditLogger — audit recording surface for trip/reset events.
 *
 * Bound to a thin adapter inside the audit module — the breaker engine
 * never depends on `AuditLogsService` directly.
 */
export interface ICircuitAuditLogger {
  logTrip(
    breakerName: string,
    context: CircuitAuditContext,
    stateChange: CircuitStateChange,
  ): Promise<void>;
  logReset(
    breakerName: string,
    context: CircuitAuditContext,
    stateChange: CircuitStateChange,
  ): Promise<void>;
}

/**
 * IPermissionChecker — abstract authorization surface.
 *
 * Single-method ISP contract. Bound to a thin adapter inside the rbac
 * module — the breaker engine never depends on `RBACService` directly.
 *
 * `principalId` is opaque: the adapter decides whether it represents a
 * role id, user id, or composite identifier.
 */
export interface IPermissionChecker {
  hasPermission(principalId: string, permission: string): Promise<boolean>;
}
