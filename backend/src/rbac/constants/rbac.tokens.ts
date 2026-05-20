/**
 * RBAC Module — Dependency Injection Tokens
 *
 * Every cross-class binding inside (and into) the RBAC module is wired
 * through these symbol tokens. Symbols guarantee module-scope uniqueness
 * and prevent accidental string-key collisions across the monorepo.
 *
 * Convention
 * ----------
 *  - `RBAC_*_TOKEN`               → interfaces owned by RBAC.
 *  - `MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN` → ports owned by another module
 *    that RBAC consumes (the owning module is responsible for binding
 *    the concrete adapter).
 */

// Internal service surfaces ---------------------------------------------------

export const RBAC_ROLE_QUERY_TOKEN = Symbol('RBAC_ROLE_QUERY_TOKEN');
export const RBAC_ROLE_COMMAND_TOKEN = Symbol('RBAC_ROLE_COMMAND_TOKEN');
export const RBAC_PERMISSION_QUERY_TOKEN = Symbol(
  'RBAC_PERMISSION_QUERY_TOKEN',
);
export const RBAC_PERMISSION_POLICY_TOKEN = Symbol(
  'RBAC_PERMISSION_POLICY_TOKEN',
);
export const RBAC_ROLE_HIERARCHY_TOKEN = Symbol('RBAC_ROLE_HIERARCHY_TOKEN');
export const RBAC_PERMISSION_CACHE_TOKEN = Symbol(
  'RBAC_PERMISSION_CACHE_TOKEN',
);
export const RBAC_SEEDER_TOKEN = Symbol('RBAC_SEEDER_TOKEN');

// Outbound ports (bound by their owning modules) ------------------------------

export const RBAC_AUDIT_EMITTER_TOKEN = Symbol('RBAC_AUDIT_EMITTER_TOKEN');
export const MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN = Symbol(
  'MEMBERSHIP_ROLE_USAGE_PROBE_TOKEN',
);
