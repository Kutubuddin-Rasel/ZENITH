/**
 * Circuit Breaker Module — DI Tokens.
 *
 * Symbol-based tokens prevent accidental name collisions and force
 * consumers through the segregated interfaces declared in
 * `../interfaces/circuit-breaker.interfaces.ts`.
 */

export const CIRCUIT_BREAKER_EXECUTOR_TOKEN = Symbol(
  'CIRCUIT_BREAKER_EXECUTOR_TOKEN',
);

export const CIRCUIT_BREAKER_REGISTRY_TOKEN = Symbol(
  'CIRCUIT_BREAKER_REGISTRY_TOKEN',
);

export const CIRCUIT_BREAKER_CONTROL_PLANE_TOKEN = Symbol(
  'CIRCUIT_BREAKER_CONTROL_PLANE_TOKEN',
);

export const CIRCUIT_AUDIT_LOGGER_TOKEN = Symbol('CIRCUIT_AUDIT_LOGGER_TOKEN');

export const PERMISSION_CHECKER_TOKEN = Symbol('PERMISSION_CHECKER_TOKEN');
