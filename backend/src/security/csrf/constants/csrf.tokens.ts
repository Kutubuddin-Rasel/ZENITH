/**
 * CSRF Module — DI Tokens (Step 1 of SOLID refactor).
 *
 * Symbol-based injection tokens for the role-segregated ports declared in
 * `../interfaces/csrf.interfaces.ts`. Every consumer inside the csrf
 * module — and any future external consumer routed through the
 * `CsrfModule` barrel — MUST inject through these tokens rather than the
 * concrete service classes. This preserves the DIP boundary and lets the
 * module swap implementations (e.g., a tamper-evident JWT-backed token
 * store) without touching call sites.
 *
 * Style mirrors `backend/src/encryption/tokens/encryption.tokens.ts`:
 * `unique symbol` for collision safety; NAME mirrors the abstract class.
 */

export const CSRF_TOKEN_COMMAND_TOKEN: unique symbol = Symbol(
  'CSRF_TOKEN_COMMAND_TOKEN',
);

export const CSRF_TOKEN_QUERY_TOKEN: unique symbol = Symbol(
  'CSRF_TOKEN_QUERY_TOKEN',
);

export const CSRF_TOKEN_REPOSITORY_TOKEN: unique symbol = Symbol(
  'CSRF_TOKEN_REPOSITORY_TOKEN',
);

export const CSRF_RATE_LIMITER_TOKEN: unique symbol = Symbol(
  'CSRF_RATE_LIMITER_TOKEN',
);

export const CSRF_AUDITOR_TOKEN: unique symbol = Symbol('CSRF_AUDITOR_TOKEN');

export const CSRF_REQUEST_CONTEXT_TOKEN: unique symbol = Symbol(
  'CSRF_REQUEST_CONTEXT_TOKEN',
);

export const CSRF_CONFIG_TOKEN: unique symbol = Symbol('CSRF_CONFIG_TOKEN');
