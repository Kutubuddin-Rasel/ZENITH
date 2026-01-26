/**
 * Cache Interface Definitions
 *
 * ARCHITECTURE (Cache Module Phase 4):
 * These interfaces define the exact structure of cached entities.
 *
 * IMPORTANT: Date fields are typed as `string` because JSON.stringify/parse
 * converts Date objects to ISO strings. Using `string` is honest about
 * the actual runtime type and prevents `.getTime()` crashes.
 *
 * These are NOT the same as database entities - they represent the
 * serialized, cacheable subset of data.
 */

/**
 * Cached user data - lightweight subset of User entity.
 * Used for session/auth lookups and permission checks.
 */
export interface CachedUser {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatar?: string;
  roles?: string[];
  permissions?: string[];
  isActive: boolean;
  isVerified?: boolean;
  lastLoginAt?: string; // ISO date string (JSON serialization)
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
  // Minimal org/team context
  organizationId?: string;
  teamIds?: string[];
}

/**
 * Cached project data - lightweight subset of Project entity.
 * Used for quick project lookups and permission checks.
 */
export interface CachedProject {
  id: string;
  name: string;
  key: string; // Project key (e.g., "PROJ")
  description?: string;
  status?: string;
  visibility?: 'private' | 'public' | 'internal';
  ownerId?: string;
  organizationId?: string;
  // Denormalized counts for UI
  issueCount?: number;
  memberCount?: number;
  // Timestamps as ISO strings
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Cached issue data - lightweight subset of Issue entity.
 * Used for issue list views and quick lookups.
 */
export interface CachedIssue {
  id: string;
  key: string; // Issue key (e.g., "PROJ-123")
  title: string;
  status?: string;
  priority?: string;
  type?: string;
  assigneeId?: string;
  reporterId?: string;
  projectId: string;
  sprintId?: string;
  // Timestamps as ISO strings
  createdAt?: string;
  updatedAt?: string;
  dueDate?: string;
}

/**
 * Redis stats response structure.
 */
export interface RedisStats {
  connected: boolean;
  memory: unknown[] | null;
  info: Record<string, unknown> | null;
  keyspace: Record<string, unknown> | null;
}
