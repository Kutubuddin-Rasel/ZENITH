import { Injectable } from '@nestjs/common';
import { EntityType } from '../entities/revision.entity';

/**
 * Represents a single field change
 */
export interface FieldDiff {
  field: string;
  label: string; // Human-readable label
  oldValue: unknown;
  newValue: unknown;
  displayOld: string; // Formatted for display
  displayNew: string; // Formatted for display
  changeType: 'added' | 'removed' | 'modified';
}

/**
 * Complete diff result for a revision
 */
export interface RevisionDiff {
  entityType: EntityType;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changes: FieldDiff[];
  summary: string; // Human-readable summary, e.g., "Status: To Do → In Progress"
  changedAt: Date;
  changedBy: string;
}

/**
 * Field metadata for display purposes
 */
interface FieldMeta {
  label: string;
  format?: (value: unknown) => string;
}

/**
 * DiffService
 *
 * Provides human-readable diff computation between revision snapshots.
 * Transforms raw JSON snapshots into user-friendly change descriptions
 * for activity feeds and audit logs.
 */
@Injectable()
export class DiffService {
  /**
   * Fields to track with human-readable labels
   * Organized by entity type for flexibility
   */
  private readonly TRACKED_FIELDS: Record<string, FieldMeta> = {
    // Issue fields
    title: { label: 'Title' },
    description: {
      label: 'Description',
      format: (v) =>
        this.truncate(
          typeof v === 'string' ? v : v != null ? JSON.stringify(v) : '',
          50,
        ),
    },
    status: { label: 'Status' },
    priority: { label: 'Priority' },
    type: { label: 'Type' },
    assigneeId: {
      label: 'Assignee',
      format: (v) => (v ? 'Assigned' : 'Unassigned'),
    },
    reporterId: { label: 'Reporter' },
    storyPoints: {
      label: 'Story Points',
      format: (v) => `${typeof v === 'number' ? v : 0} points`,
    },
    dueDate: { label: 'Due Date', format: (v) => this.formatDate(v) },
    labels: { label: 'Labels', format: (v) => this.formatArray(v) },
    parentId: { label: 'Parent Issue' },
    sprintId: { label: 'Sprint' },
    isArchived: { label: 'Archived', format: (v) => (v ? 'Yes' : 'No') },

    // Project fields
    name: { label: 'Name' },
    key: { label: 'Key' },
    methodology: { label: 'Methodology' },

    // Sprint fields
    goal: { label: 'Goal' },
    startDate: { label: 'Start Date', format: (v) => this.formatDate(v) },
    endDate: { label: 'End Date', format: (v) => this.formatDate(v) },

    // Board fields
    columns: { label: 'Columns', format: (v) => this.formatArray(v) },

    // Common fields
    color: { label: 'Color' },
  };

  /**
   * Compute diff between two snapshots
   *
   * @param before - Previous snapshot (null for CREATE)
   * @param after - Current snapshot (null for DELETE)
   * @param entityType - Type of entity
   * @param changedBy - User ID who made the change
   * @param changedAt - When the change occurred
   * @returns RevisionDiff with human-readable changes
   */
  computeDiff(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    entityType: EntityType,
    changedBy: string,
    changedAt: Date,
  ): RevisionDiff {
    // Handle CREATE
    if (!before && after) {
      return {
        entityType,
        entityId: after.id as string,
        action: 'CREATE',
        changes: [],
        summary: `Created ${this.formatEntityType(entityType)}`,
        changedAt,
        changedBy,
      };
    }

    // Handle DELETE
    if (before && !after) {
      return {
        entityType,
        entityId: before.id as string,
        action: 'DELETE',
        changes: [],
        summary: `Deleted ${this.formatEntityType(entityType)}`,
        changedAt,
        changedBy,
      };
    }

    // Handle UPDATE
    const changes: FieldDiff[] = [];

    if (before && after) {
      for (const [field, meta] of Object.entries(this.TRACKED_FIELDS)) {
        const oldVal = before[field];
        const newVal = after[field];

        if (!this.deepEqual(oldVal, newVal)) {
          const oldDisplay = this.formatValue(oldVal, meta.format);
          const newDisplay = this.formatValue(newVal, meta.format);

          let changeType: FieldDiff['changeType'];
          if (this.isEmpty(oldVal) && !this.isEmpty(newVal)) {
            changeType = 'added';
          } else if (!this.isEmpty(oldVal) && this.isEmpty(newVal)) {
            changeType = 'removed';
          } else {
            changeType = 'modified';
          }

          changes.push({
            field,
            label: meta.label,
            oldValue: oldVal,
            newValue: newVal,
            displayOld: oldDisplay,
            displayNew: newDisplay,
            changeType,
          });
        }
      }
    }

    return {
      entityType,
      entityId: (after?.id || before?.id) as string,
      action: 'UPDATE',
      changes,
      summary: this.generateSummary(changes),
      changedAt,
      changedBy,
    };
  }

  /**
   * Generate human-readable summary from changes
   * Examples:
   * - "Status: To Do → In Progress"
   * - "Status: To Do → In Progress, Assignee: Unassigned → Assigned"
   * - "Updated 5 fields"
   */
  private generateSummary(changes: FieldDiff[]): string {
    if (changes.length === 0) {
      return 'No detected changes';
    }

    if (changes.length === 1) {
      const c = changes[0];
      return `${c.label}: ${c.displayOld} → ${c.displayNew}`;
    }

    if (changes.length === 2) {
      return changes
        .map((c) => `${c.label}: ${c.displayOld} → ${c.displayNew}`)
        .join(', ');
    }

    // For 3+ changes, show first two and count
    const first2 = changes.slice(0, 2);
    const remaining = changes.length - 2;
    return (
      first2
        .map((c) => `${c.label}: ${c.displayOld} → ${c.displayNew}`)
        .join(', ') + ` and ${remaining} more change${remaining > 1 ? 's' : ''}`
    );
  }

  /**
   * Format a value for display
   */
  private formatValue(
    value: unknown,
    customFormat?: (value: unknown) => string,
  ): string {
    if (customFormat) {
      return customFormat(value);
    }

    if (value === null || value === undefined || value === '') {
      return 'None';
    }

    if (Array.isArray(value)) {
      return this.formatArray(value);
    }

    if (value instanceof Date) {
      return this.formatDate(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }

    return 'Unknown';
  }

  /**
   * Format date for display
   */
  private formatDate(value: unknown): string {
    if (!value) return 'None';

    try {
      const date = new Date(value as string | number | Date);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : 'Unknown';
    }
  }

  /**
   * Format array for display
   */
  private formatArray(value: unknown): string {
    if (!value || !Array.isArray(value)) return 'None';
    if (value.length === 0) return 'None';
    if (value.length <= 3) return value.join(', ');
    return `${value.slice(0, 3).join(', ')} and ${value.length - 3} more`;
  }

  /**
   * Truncate text for display
   */
  private truncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || 'None';
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Format entity type for display
   */
  private formatEntityType(type: EntityType): string {
    return type.toLowerCase();
  }

  /**
   * Check if value is empty
   */
  private isEmpty(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (a === undefined || b === undefined) return a === b;
    if (typeof a !== typeof b) return false;

    // Handle Date comparison
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.deepEqual(val, b[idx]));
    }

    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((key) => this.deepEqual(aObj[key], bObj[key]));
    }

    return false;
  }

  /**
   * Get a simplified changes array for API responses
   * Returns just the essential info for the frontend
   */
  getSimplifiedChanges(diff: RevisionDiff): Array<{
    field: string;
    label: string;
    from: string;
    to: string;
    type: string;
  }> {
    return diff.changes.map((c) => ({
      field: c.field,
      label: c.label,
      from: c.displayOld,
      to: c.displayNew,
      type: c.changeType,
    }));
  }
}
