/**
 * API Scopes Vocabulary
 *
 * This file defines the MASTER VOCABULARY for all valid API key scopes.
 * This is the ONLY source of truth for what scopes can be assigned.
 *
 * ARCHITECTURE DECISIONS:
 * 1. Static constants (not database) for O(1) validation in hot path
 * 2. Rich metadata for documentation and risk assessment
 * 3. Hierarchy support via "implies" field
 *
 * ADDING NEW SCOPES:
 * 1. Add the scope definition below
 * 2. Existing API keys will NOT auto-get new scopes (explicit assignment required)
 * 3. Document the scope in API documentation
 *
 * FORMAT: resource:action
 * - resource: The entity being accessed (projects, issues, users, etc.)
 * - action: The operation (read, write, admin, delete)
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Risk level for scope-based access
 *
 * Used for:
 * - Audit UI highlighting
 * - Approval workflows (HIGH/CRITICAL may require manager approval)
 * - Compliance reporting
 */
export enum ScopeRiskLevel {
  LOW = 'LOW', // Read-only, non-sensitive
  MEDIUM = 'MEDIUM', // Write access, potentially sensitive
  HIGH = 'HIGH', // Admin/delete access, sensitive operations
  CRITICAL = 'CRITICAL', // System-level, security-critical
}

/**
 * Scope definition with rich metadata
 */
export interface ScopeDefinition {
  /** Human-readable description for documentation */
  description: string;

  /** Risk level for audit/governance */
  risk: ScopeRiskLevel;

  /**
   * Scopes that this scope implies (hierarchy).
   * If a key has 'projects:admin', it automatically has 'projects:read' and 'projects:write'.
   */
  implies: string[];

  /** The resource category for grouping in UI */
  category: string;

  /** Whether this scope is deprecated (for migration) */
  deprecated?: boolean;

  /** Deprecation message if deprecated */
  deprecationMessage?: string;
}

// =============================================================================
// MASTER SCOPE VOCABULARY
// =============================================================================

export const API_SCOPES: Record<string, ScopeDefinition> = {
  // ===========================================================================
  // PROJECTS
  // ===========================================================================
  'projects:read': {
    description: 'Read-only access to project information and settings',
    risk: ScopeRiskLevel.LOW,
    implies: [],
    category: 'Projects',
  },
  'projects:write': {
    description: 'Create and update projects (excludes deletion)',
    risk: ScopeRiskLevel.MEDIUM,
    implies: ['projects:read'],
    category: 'Projects',
  },
  'projects:delete': {
    description: 'Delete projects permanently',
    risk: ScopeRiskLevel.HIGH,
    implies: ['projects:read'],
    category: 'Projects',
  },
  'projects:admin': {
    description:
      'Full administrative access to projects including member management',
    risk: ScopeRiskLevel.HIGH,
    implies: ['projects:read', 'projects:write', 'projects:delete'],
    category: 'Projects',
  },

  // ===========================================================================
  // ISSUES
  // ===========================================================================
  'issues:read': {
    description: 'Read issues, comments, and attachments',
    risk: ScopeRiskLevel.LOW,
    implies: [],
    category: 'Issues',
  },
  'issues:write': {
    description: 'Create and update issues',
    risk: ScopeRiskLevel.MEDIUM,
    implies: ['issues:read'],
    category: 'Issues',
  },
  'issues:delete': {
    description: 'Delete issues permanently',
    risk: ScopeRiskLevel.HIGH,
    implies: ['issues:read'],
    category: 'Issues',
  },
  'issues:admin': {
    description: 'Full issue management including bulk operations',
    risk: ScopeRiskLevel.HIGH,
    implies: ['issues:read', 'issues:write', 'issues:delete'],
    category: 'Issues',
  },

  // ===========================================================================
  // USERS
  // ===========================================================================
  'users:read': {
    description: 'Read user profiles and basic information',
    risk: ScopeRiskLevel.LOW,
    implies: [],
    category: 'Users',
  },
  'users:write': {
    description: 'Update user profiles (own profile or with admin)',
    risk: ScopeRiskLevel.MEDIUM,
    implies: ['users:read'],
    category: 'Users',
  },
  'users:admin': {
    description: 'Full user management including roles and permissions',
    risk: ScopeRiskLevel.CRITICAL,
    implies: ['users:read', 'users:write'],
    category: 'Users',
  },

  // ===========================================================================
  // SPRINTS
  // ===========================================================================
  'sprints:read': {
    description: 'Read sprint information and progress',
    risk: ScopeRiskLevel.LOW,
    implies: [],
    category: 'Sprints',
  },
  'sprints:write': {
    description: 'Create and manage sprints',
    risk: ScopeRiskLevel.MEDIUM,
    implies: ['sprints:read'],
    category: 'Sprints',
  },

  // ===========================================================================
  // REPORTS
  // ===========================================================================
  'reports:read': {
    description: 'Access analytics and reports',
    risk: ScopeRiskLevel.MEDIUM,
    implies: [],
    category: 'Reports',
  },
  'reports:export': {
    description: 'Export reports and data',
    risk: ScopeRiskLevel.HIGH,
    implies: ['reports:read'],
    category: 'Reports',
  },

  // ===========================================================================
  // WEBHOOKS
  // ===========================================================================
  'webhooks:read': {
    description: 'View webhook configurations',
    risk: ScopeRiskLevel.LOW,
    implies: [],
    category: 'Webhooks',
  },
  'webhooks:write': {
    description: 'Create and manage webhooks',
    risk: ScopeRiskLevel.HIGH,
    implies: ['webhooks:read'],
    category: 'Webhooks',
  },

  // ===========================================================================
  // API KEYS (Meta-scope for key management)
  // ===========================================================================
  'api-keys:read': {
    description: 'List own API keys (without secrets)',
    risk: ScopeRiskLevel.LOW,
    implies: [],
    category: 'API Keys',
  },
  'api-keys:write': {
    description: 'Create and rotate API keys',
    risk: ScopeRiskLevel.HIGH,
    implies: ['api-keys:read'],
    category: 'API Keys',
  },
  'api-keys:admin': {
    description: 'Manage API keys for any user (admin only)',
    risk: ScopeRiskLevel.CRITICAL,
    implies: ['api-keys:read', 'api-keys:write'],
    category: 'API Keys',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all valid scope strings
 */
export function getAllValidScopes(): string[] {
  return Object.keys(API_SCOPES);
}

/**
 * Check if a scope string is valid
 */
export function isValidScope(scope: string): boolean {
  return scope in API_SCOPES;
}

/**
 * Get scope definition (returns undefined for invalid scopes)
 */
export function getScopeDefinition(scope: string): ScopeDefinition | undefined {
  return API_SCOPES[scope];
}

/**
 * Expand a list of scopes to include all implied scopes.
 * Uses a Set to avoid duplicates.
 *
 * Example: ['projects:admin'] → ['projects:admin', 'projects:read', 'projects:write', 'projects:delete']
 */
export function expandScopes(scopes: string[]): string[] {
  const expanded = new Set<string>();

  function expand(scope: string): void {
    if (expanded.has(scope)) return;

    const definition = API_SCOPES[scope];
    if (!definition) return; // Invalid scope, skip

    expanded.add(scope);

    for (const implied of definition.implies) {
      expand(implied);
    }
  }

  for (const scope of scopes) {
    expand(scope);
  }

  return Array.from(expanded);
}

/**
 * Check if a key with given scopes has access to a required scope.
 * Uses hierarchy expansion.
 */
export function hasScope(keyScopes: string[], requiredScope: string): boolean {
  const expanded = expandScopes(keyScopes);
  return expanded.includes(requiredScope);
}

/**
 * Get scopes grouped by category (for UI display)
 */
export function getScopesByCategory(): Record<
  string,
  { scope: string; definition: ScopeDefinition }[]
> {
  const grouped: Record<
    string,
    { scope: string; definition: ScopeDefinition }[]
  > = {};

  for (const [scope, definition] of Object.entries(API_SCOPES)) {
    if (!grouped[definition.category]) {
      grouped[definition.category] = [];
    }
    grouped[definition.category].push({ scope, definition });
  }

  return grouped;
}

/**
 * Get all HIGH risk scopes (for audit highlighting)
 */
export function getHighRiskScopes(): string[] {
  return Object.entries(API_SCOPES)
    .filter(
      ([_, def]) =>
        def.risk === ScopeRiskLevel.HIGH ||
        def.risk === ScopeRiskLevel.CRITICAL,
    )
    .map(([scope]) => scope);
}
