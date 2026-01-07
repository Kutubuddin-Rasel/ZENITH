/**
 * Safe Query Helper
 *
 * Utilities for writing tenant-safe raw SQL queries.
 * Use these helpers when you need to bypass TypeORM and write raw SQL.
 *
 * @module core/database/safe-query.helper
 */

import { TenantContext } from '../tenant/tenant-context.service';

/**
 * Tables that have direct organizationId column
 */
const DIRECT_TENANT_TABLES = [
  'projects',
  'users',
  'roles',
  'integrations',
  'saml_configs',
  'organization_invitations',
  'organizations',
];

/**
 * Tables that link to tenant via projectId → projects.organizationId
 */
const PROJECT_LINKED_TABLES = [
  'issues',
  'boards',
  'board_columns',
  'sprints',
  'sprint_issues',
  'project_members',
  'webhooks',
  'webhook_logs',
  'labels',
  'components',
  'attachments',
  'comments',
  'work_logs',
  'custom_field_definitions',
  'custom_field_values',
  'revisions',
  'notifications',
  'resource_allocations',
  'resource_forecasts',
  'documents',
  'document_segments',
  'watchers',
  'issue_links',
  'issue_labels',
  'issue_components',
  'ai_suggestions',
];

/**
 * Generates a WHERE clause fragment for tenant isolation
 *
 * @param tableName - The SQL table name
 * @param alias - The table alias used in the query
 * @param tenantContext - The TenantContext service instance
 * @returns SQL WHERE clause fragment
 *
 * @example
 * // For direct tenant table:
 * withTenantScope('projects', 'p', tenantContext)
 * // Returns: `p."organizationId" = 'uuid-here'`
 *
 * // For project-linked table:
 * withTenantScope('issues', 'i', tenantContext)
 * // Returns: `EXISTS (SELECT 1 FROM projects __tp WHERE __tp.id = i."projectId" AND __tp."organizationId" = 'uuid-here' AND __tp."deletedAt" IS NULL)`
 */
export function withTenantScope(
  tableName: string,
  alias: string,
  tenantContext: TenantContext,
): string {
  const tenantId = tenantContext.getTenantId();

  if (!tenantId) {
    throw new Error(
      'TenantContext is empty - refusing to generate query without tenant scope. ' +
        'Ensure request has valid authorization.',
    );
  }

  // Escape the tenant ID to prevent SQL injection
  const escapedTenantId = tenantId.replace(/'/g, "''");

  if (DIRECT_TENANT_TABLES.includes(tableName)) {
    return `${alias}."organizationId" = '${escapedTenantId}'`;
  }

  if (PROJECT_LINKED_TABLES.includes(tableName)) {
    // Use EXISTS subquery for tenant isolation via project
    // Also filters out soft-deleted projects
    return `EXISTS (
      SELECT 1 FROM projects __tp
      WHERE __tp.id = ${alias}."projectId"
        AND __tp."organizationId" = '${escapedTenantId}'
        AND __tp."deletedAt" IS NULL
    )`;
  }

  throw new Error(
    `Unknown table "${tableName}" for tenant scoping. ` +
      'Add it to DIRECT_TENANT_TABLES or PROJECT_LINKED_TABLES in safe-query.helper.ts',
  );
}

/**
 * Generates a JOIN clause for tenant isolation (better performance for large queries)
 *
 * @param tableName - The SQL table name
 * @param alias - The table alias used in the query
 * @param tenantContext - The TenantContext service instance
 * @returns SQL INNER JOIN clause or empty string for direct tenant tables
 *
 * @example
 * tenantJoin('issues', 'i', tenantContext)
 * // Returns: `INNER JOIN projects __tp ON __tp.id = i."projectId" AND __tp."organizationId" = 'uuid' AND __tp."deletedAt" IS NULL`
 */
export function tenantJoin(
  tableName: string,
  alias: string,
  tenantContext: TenantContext,
): string {
  const tenantId = tenantContext.getTenantId();

  if (!tenantId) {
    throw new Error(
      'TenantContext is empty - refusing to generate query without tenant scope.',
    );
  }

  const escapedTenantId = tenantId.replace(/'/g, "''");

  if (DIRECT_TENANT_TABLES.includes(tableName)) {
    // No join needed for direct tenant tables, use WHERE instead
    return '';
  }

  if (PROJECT_LINKED_TABLES.includes(tableName)) {
    return `INNER JOIN projects __tp 
      ON __tp.id = ${alias}."projectId" 
      AND __tp."organizationId" = '${escapedTenantId}'
      AND __tp."deletedAt" IS NULL`;
  }

  throw new Error(
    `Unknown table "${tableName}" for tenant join. ` +
      'Add it to DIRECT_TENANT_TABLES or PROJECT_LINKED_TABLES.',
  );
}

/**
 * Generates a direct tenant WHERE condition for use with tenantJoin()
 * Use this when you've added a tenantJoin() and need the tenant condition for direct tables
 *
 * @param alias - The table alias
 * @param tenantContext - The TenantContext service instance
 * @returns SQL condition or empty string
 */
export function directTenantWhere(
  alias: string,
  tenantContext: TenantContext,
): string {
  const tenantId = tenantContext.getTenantId();
  if (!tenantId) return '';

  const escapedTenantId = tenantId.replace(/'/g, "''");
  return `${alias}."organizationId" = '${escapedTenantId}'`;
}

/**
 * Validates that a raw query string includes tenant protection
 * Use in development/testing to catch unprotected queries
 *
 * @param query - The raw SQL query string
 * @throws Error if query appears to lack tenant isolation
 */
export function assertTenantSafe(query: string): void {
  const hasTenantCheck =
    query.includes('organizationId') ||
    query.includes('__tp') ||
    query.includes('__tenant');

  if (!hasTenantCheck) {
    throw new Error(
      `SECURITY: Raw query appears to lack tenant isolation.\n` +
        `Query preview: ${query.substring(0, 200)}...\n` +
        `Use withTenantScope() or tenantJoin() helper.`,
    );
  }
}

/**
 * Type for raw query result row - use to type query results
 */
export type RawQueryRow = Record<string, unknown>;
