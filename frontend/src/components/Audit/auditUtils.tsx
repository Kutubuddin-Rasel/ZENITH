import React from 'react';
import {
    ExclamationTriangleIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

/**
 * Get color classes for severity badge
 */
export function getSeverityColor(severity: string): string {
    switch (severity) {
        case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-200';
        case 'high': return 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-200';
        case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200';
        case 'low': return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-200';
        default: return 'text-neutral-600 bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-200';
    }
}

/**
 * Get icon component for status
 */
export function getStatusIcon(status: string): React.ReactElement {
    switch (status) {
        case 'success': return <CheckCircleIcon className="h-4 w-4 text-green-600" />;
        case 'failure': return <XCircleIcon className="h-4 w-4 text-red-600" />;
        case 'warning': return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600" />;
        default: return <ClockIcon className="h-4 w-4 text-neutral-600" />;
    }
}

/**
 * Format timestamp to locale string
 */
export function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
}
