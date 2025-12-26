/**
 * Project Health Calculation Utility
 * 
 * Determines project health status based on issue distribution.
 */

export type HealthStatus = 'on-track' | 'at-risk' | 'off-track';

export interface HealthResult {
    status: HealthStatus;
    label: string;
    color: 'success' | 'warning' | 'error' | 'neutral';
    reason: string;
}

/**
 * Calculate project health based on issue status distribution.
 * 
 * Algorithm:
 * 1. OFF-TRACK: If blockedCount > 0 AND blockedCount >= 20% of open issues
 * 2. AT-RISK: If blockedCount > 0 OR (inProgressCount == 0 AND openIssues > 0)
 * 3. ON-TRACK: Default state when work is flowing normally
 */
export function getProjectHealth(
    statusCounts: Record<string, number> | undefined,
    percentDone: number
): HealthResult {
    if (!statusCounts) {
        return {
            status: 'on-track',
            label: 'New Project',
            color: 'neutral',
            reason: 'Loading...'
        };
    }

    const blocked = statusCounts['Blocked'] || 0;
    const inProgress = statusCounts['InProgress'] || 0;
    const todo = statusCounts['Todo'] || 0;
    const backlog = statusCounts['Backlog'] || 0;
    const done = statusCounts['Done'] || 0;

    const openIssues = blocked + inProgress + todo + backlog;
    const totalIssues = openIssues + done;

    // Edge case: Empty project
    if (totalIssues === 0) {
        return {
            status: 'on-track',
            label: 'New Project',
            color: 'neutral',
            reason: 'No issues created yet'
        };
    }

    // Edge case: All done
    if (percentDone === 100) {
        return {
            status: 'on-track',
            label: 'Complete',
            color: 'success',
            reason: 'All issues completed!'
        };
    }

    // OFF-TRACK: Significant blockers (>= 20% of open issues)
    if (blocked > 0 && openIssues > 0) {
        const blockedPercent = (blocked / openIssues) * 100;
        if (blockedPercent >= 20) {
            return {
                status: 'off-track',
                label: 'Off Track',
                color: 'error',
                reason: `${blocked} blocked (${blockedPercent.toFixed(0)}% of open)`
            };
        }
    }

    // AT-RISK: Any blockers
    if (blocked > 0) {
        return {
            status: 'at-risk',
            label: 'At Risk',
            color: 'warning',
            reason: `${blocked} blocked issue${blocked > 1 ? 's' : ''}`
        };
    }

    // AT-RISK: Stalled (no work in progress)
    if (inProgress === 0 && openIssues > 0) {
        return {
            status: 'at-risk',
            label: 'At Risk',
            color: 'warning',
            reason: 'No work in progress'
        };
    }

    // ON-TRACK: Work is flowing
    return {
        status: 'on-track',
        label: 'On Track',
        color: 'success',
        reason: 'Work progressing normally'
    };
}

/**
 * Get CSS classes for health badge
 */
export function getHealthBadgeClasses(color: HealthResult['color']): string {
    const baseClasses = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold';

    switch (color) {
        case 'success':
            return `${baseClasses} bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400`;
        case 'warning':
            return `${baseClasses} bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400`;
        case 'error':
            return `${baseClasses} bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400`;
        case 'neutral':
        default:
            return `${baseClasses} bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400`;
    }
}
