/**
 * Session module injection tokens (DIP seam).
 *
 * Each token is the runtime injection key for an abstract port declared in
 * `../interfaces/session.interfaces.ts`. Concrete implementations are bound in
 * `session.module.ts` via custom providers
 * (`{ provide: SESSION_*_TOKEN, useClass: ... }`) and consumed with
 * `@Inject(SESSION_*_TOKEN) private readonly x: IPort`.
 *
 * Mirrors the established `access-control/constants/access-control.tokens.ts`
 * precedent.
 */

// --- Infrastructure ports ---------------------------------------------------
export const SESSION_STORE_TOKEN = Symbol('ISessionStore');
export const SESSION_USER_LOOKUP_TOKEN = Symbol('ISessionUserLookup');
export const SESSION_CONFIG_TOKEN = Symbol('ISessionConfig');
export const SESSION_AUDITOR_TOKEN = Symbol('ISessionAuditor');
export const SESSION_DEVICE_PARSER_TOKEN = Symbol('ISessionDeviceParser');

// --- Application (role-segregated) ports ------------------------------------
export const SESSION_QUERY_TOKEN = Symbol('ISessionQuery');
export const SESSION_COMMAND_TOKEN = Symbol('ISessionCommand');
export const SESSION_LIFECYCLE_TOKEN = Symbol('ISessionLifecycle');
export const SESSION_SECURITY_TOKEN = Symbol('ISessionSecurity');
