/**
 * Issue Utilities - Icons, Colors, and Helpers
 * 
 * Provides consistent styling for issue types, statuses, and priorities
 * across all views (Backlog, Board, Issue List, etc.)
 */

import React from 'react';
import {
    BugAntIcon,
    CheckCircleIcon,
    BookOpenIcon,
    BoltIcon,
    MinusIcon,
} from '@heroicons/react/24/solid';

// ============= Issue Type =============

export type IssueType = 'Epic' | 'Story' | 'Task' | 'Bug' | 'Sub-task';

interface TypeConfig {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    label: string;
}

export const issueTypeConfig: Record<IssueType, TypeConfig> = {
    Bug: {
        icon: BugAntIcon,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        label: 'Bug',
    },
    Task: {
        icon: CheckCircleIcon,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        label: 'Task',
    },
    Story: {
        icon: BookOpenIcon,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        label: 'Story',
    },
    Epic: {
        icon: BoltIcon,
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        label: 'Epic',
    },
    'Sub-task': {
        icon: MinusIcon,
        color: 'text-neutral-600 dark:text-neutral-400',
        bgColor: 'bg-neutral-100 dark:bg-neutral-800',
        label: 'Sub-task',
    },
};

export function getIssueTypeConfig(type: string): TypeConfig {
    return issueTypeConfig[type as IssueType] || issueTypeConfig.Task;
}

export function IssueTypeIcon({ type, className = 'h-4 w-4' }: { type: string; className?: string }) {
    const config = getIssueTypeConfig(type);
    const Icon = config.icon;
    return <Icon className={`${className} ${config.color}`} />;
}

// ============= Issue Status =============

interface StatusConfig {
    color: string;
    bgColor: string;
    dotColor: string;
}

const statusConfig: Record<string, StatusConfig> = {
    Backlog: {
        color: 'text-neutral-600 dark:text-neutral-400',
        bgColor: 'bg-neutral-100 dark:bg-neutral-800',
        dotColor: 'bg-neutral-400',
    },
    Todo: {
        color: 'text-neutral-700 dark:text-neutral-300',
        bgColor: 'bg-neutral-100 dark:bg-neutral-800',
        dotColor: 'bg-neutral-500',
    },
    InProgress: {
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        dotColor: 'bg-blue-500',
    },
    Review: {
        color: 'text-purple-700 dark:text-purple-300',
        bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        dotColor: 'bg-purple-500',
    },
    Done: {
        color: 'text-green-700 dark:text-green-300',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        dotColor: 'bg-green-500',
    },
    Blocked: {
        color: 'text-red-700 dark:text-red-300',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        dotColor: 'bg-red-500',
    },
};

export function getStatusConfig(status: string): StatusConfig {
    return statusConfig[status] || statusConfig.Todo;
}

export function StatusDot({ status, className = 'h-2 w-2' }: { status: string; className?: string }) {
    const config = getStatusConfig(status);
    return <span className={`${className} rounded-full ${config.dotColor}`} />;
}

export function StatusBadge({ status }: { status: string }) {
    const config = getStatusConfig(status);
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${config.bgColor} ${config.color}`}>
            <StatusDot status={status} className="h-1.5 w-1.5" />
            {status}
        </span>
    );
}

// ============= Priority =============

export const priorityConfig = {
    Highest: { color: 'text-red-700', bgColor: 'bg-red-50 ring-red-600/20' },
    High: { color: 'text-orange-700', bgColor: 'bg-orange-50 ring-orange-600/20' },
    Medium: { color: 'text-yellow-700', bgColor: 'bg-yellow-50 ring-yellow-600/20' },
    Low: { color: 'text-green-700', bgColor: 'bg-green-50 ring-green-600/20' },
    Lowest: { color: 'text-blue-700', bgColor: 'bg-blue-50 ring-blue-600/20' },
};

export function getPriorityConfig(priority: string) {
    return priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.Medium;
}

// ============= Sprint Status =============

export type SprintStatus = 'active' | 'planned' | 'completed';

export function getSprintStatus(sprint: { status: string; startDate?: string; endDate?: string }): SprintStatus {
    if (sprint.status === 'COMPLETED') return 'completed';
    if (sprint.status === 'ACTIVE') return 'active';

    // Fallback to date-based detection if status is just PLANNED
    if (sprint.startDate && sprint.endDate) {
        const now = new Date();
        const start = new Date(sprint.startDate);
        const end = new Date(sprint.endDate);

        if (now >= start && now <= end) return 'active';
        if (now > end) return 'completed';
    }

    return 'planned';
}

export const sprintStatusConfig = {
    active: {
        label: 'ACTIVE',
        color: 'text-green-700 dark:text-green-300',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    planned: {
        label: 'PLANNED',
        color: 'text-neutral-600 dark:text-neutral-400',
        bgColor: 'bg-neutral-100 dark:bg-neutral-800',
    },
    completed: {
        label: 'COMPLETED',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
};

export function SprintStatusBadge({ status }: { status: SprintStatus }) {
    const config = sprintStatusConfig[status];
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${config.bgColor} ${config.color}`}>
            {config.label}
        </span>
    );
}
