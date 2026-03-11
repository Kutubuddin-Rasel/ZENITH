/**
 * Synthetic tenant ID for system-level audit logs.
 *
 * Used by:
 * - Cron jobs (no HTTP context)
 * - CSRF guards (pre-authentication security forensics)
 * - API key validation failures (no authenticated user)
 * - Any context where organizationId is unavailable
 *
 * This UUID-zero value ensures the NOT NULL constraint on
 * AuditLog.organizationId is never violated, while remaining
 * un-queryable by real tenant-scoped queries.
 */
export const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
