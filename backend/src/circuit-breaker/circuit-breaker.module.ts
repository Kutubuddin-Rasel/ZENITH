import { Global, Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { CommonObservabilityModule } from '../common/submodules/observability.module';
import {
  CIRCUIT_BREAKER_CONTROL_PLANE_TOKEN,
  CIRCUIT_BREAKER_EXECUTOR_TOKEN,
  CIRCUIT_BREAKER_REGISTRY_TOKEN,
} from './constants/circuit-breaker.tokens';
import { CircuitBreakerControlPlane } from './providers/circuit-breaker.control-plane';
import { CircuitBreakerEventBinder } from './providers/circuit-breaker-event.binder';
import { CircuitBreakerOrchestrator } from './providers/circuit-breaker.orchestrator';
import { RedisCircuitStateSync } from './providers/redis-circuit-state-sync';

/**
 * CircuitBreakerModule — Step 3 final SRP decomposition.
 *
 * RESPONSIBILITY:
 *   Centralized opossum-backed protection for outbound service calls.
 *   Decomposed into four focused providers:
 *
 *     - `CircuitBreakerOrchestrator`      → executor + registry
 *     - `CircuitBreakerControlPlane`      → manual trip / reset + RBAC
 *     - `CircuitBreakerEventBinder`       → opossum → Prometheus wiring
 *     - `RedisCircuitStateSync`           → cross-pod state replication
 *
 *   Cross-domain adapters (RBAC, audit) are registered by their owning
 *   modules against `PERMISSION_CHECKER_TOKEN` and
 *   `CIRCUIT_AUDIT_LOGGER_TOKEN` — this module never imports a
 *   concrete RBAC or audit class.
 *
 * EXPORT POLICY (Zero Concrete Leaks):
 *   Only segregated interface tokens are exported. Consumers MUST inject
 *   the narrowest token they need:
 *     - `CIRCUIT_BREAKER_EXECUTOR_TOKEN`      — 90% of callers
 *     - `CIRCUIT_BREAKER_REGISTRY_TOKEN`      — health / status callers
 *     - `CIRCUIT_BREAKER_CONTROL_PLANE_TOKEN` — admin controllers only
 *
 *   The four concrete provider classes are NOT exported — they remain
 *   implementation details of this module.
 */
@Global()
@Module({
  imports: [CacheModule, CommonObservabilityModule],
  providers: [
    CircuitBreakerEventBinder,
    RedisCircuitStateSync,
    CircuitBreakerOrchestrator,
    CircuitBreakerControlPlane,
    {
      provide: CIRCUIT_BREAKER_EXECUTOR_TOKEN,
      useExisting: CircuitBreakerOrchestrator,
    },
    {
      provide: CIRCUIT_BREAKER_REGISTRY_TOKEN,
      useExisting: CircuitBreakerOrchestrator,
    },
    {
      provide: CIRCUIT_BREAKER_CONTROL_PLANE_TOKEN,
      useExisting: CircuitBreakerControlPlane,
    },
  ],
  exports: [
    CIRCUIT_BREAKER_EXECUTOR_TOKEN,
    CIRCUIT_BREAKER_REGISTRY_TOKEN,
    CIRCUIT_BREAKER_CONTROL_PLANE_TOKEN,
  ],
})
export class CircuitBreakerModule {}
