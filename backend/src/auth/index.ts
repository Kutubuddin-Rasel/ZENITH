/**
 * Auth module — public barrel.
 *
 * Step 1 of the auth refactor: exposes ONLY the segregated interfaces
 * and DI tokens. Concrete services are intentionally NOT re-exported —
 * downstream modules must depend on the abstractions.
 */

export * from './interfaces';
export * from './constants/auth.tokens';
