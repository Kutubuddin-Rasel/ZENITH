/**
 * Symbol-based Dependency Injection tokens for the segregated tenant
 * contracts defined in `../interfaces/tenant.interfaces.ts`.
 *
 * Symbols guarantee uniqueness across modules and prevent the
 * "string-token collision" class of bugs. Consumers inject via:
 *
 * ```ts
 * constructor(
 *   @Inject(TENANT_CONTEXT_READER_TOKEN)
 *   private readonly tenant: ITenantContextReader,
 * ) {}
 * ```
 */

export const TENANT_CONTEXT_READER_TOKEN = Symbol(
  'TENANT_CONTEXT_READER_TOKEN',
);

export const TENANT_CONTEXT_WRITER_TOKEN = Symbol(
  'TENANT_CONTEXT_WRITER_TOKEN',
);

export const TENANT_BYPASS_CONTROLLER_TOKEN = Symbol(
  'TENANT_BYPASS_CONTROLLER_TOKEN',
);

export const TENANT_IDENTITY_RESOLVER_TOKEN = Symbol(
  'TENANT_IDENTITY_RESOLVER_TOKEN',
);

export const BYPASS_AUDIT_WRITER_TOKEN = Symbol('BYPASS_AUDIT_WRITER_TOKEN');
