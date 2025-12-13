import React from 'react';
import { useRouter } from 'next/navigation';
import { Issue } from '../hooks/useProjectIssues';
import Button from './Button';
import { TagIcon as TagSolidIcon, UserCircleIcon, PencilSquareIcon, EyeIcon, ArchiveBoxIcon, ArchiveBoxXMarkIcon } from '@heroicons/react/24/solid';

interface IssueCardProps {
    issue: Issue;
    projectId: string;
    onEdit: (issue: Issue) => void;
    onArchive?: (issueId: string) => Promise<void>;
    onUnarchive?: (issueId: string) => Promise<void>;
}

function getStatusColor(status: string) {
    switch (status) {
        case 'To Do': return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200';
        case 'In Progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-200';
        case 'Done': return 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-200';
        default: return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300';
    }
}

function getPriorityColor(priority: string) {
    switch (priority) {
        case 'Highest': return 'bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-200';
        case 'High': return 'bg-orange-100 text-orange-700 dark:bg-orange-700 dark:text-orange-200';
        case 'Medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-700 dark:text-yellow-200';
        case 'Low': return 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-200';
        default: return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300';
    }
}

function getTypeIcon(type: string) {
    switch (type) {
        case 'Bug': return <TagSolidIcon className="h-4 w-4 text-red-500" title="Bug" />;
        case 'Story': return <TagSolidIcon className="h-4 w-4 text-green-500" title="Story" />;
        case 'Task': return <TagSolidIcon className="h-4 w-4 text-blue-500" title="Task" />;
        case 'Epic': return <TagSolidIcon className="h-4 w-4 text-purple-500" title="Epic" />;
        default: return <TagSolidIcon className="h-4 w-4 text-neutral-400" title={type} />;
    }
}

function getAvatar(name: string | undefined) {
    if (!name) return <UserCircleIcon className="h-8 w-8 text-neutral-300 dark:text-neutral-700" />;
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-medium text-sm">{initials}</span>;
}

function getAssigneeDisplayName(issue: Issue) {
    if (issue.assignee && typeof issue.assignee === 'object' && issue.assignee.name) {
        return issue.assignee.name;
    } else if (issue.assigneeId) {
        return `User ${issue.assigneeId.slice(0, 8)}...`;
    } else {
        return 'Unassigned';
    }
}

function getAssigneeAvatar(issue: Issue) {
    if (issue.assignee && typeof issue.assignee === 'object' && issue.assignee.name) {
        return getAvatar(issue.assignee.name);
    }
    return getAvatar(undefined);
}

const IssueCard = React.memo(({ issue, projectId, onEdit, onArchive, onUnarchive }: IssueCardProps) => {
    const router = useRouter();
    const [isArchiving, setIsArchiving] = React.useState(false);

    return (
        <div
            className={`bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 group h-full ${issue.isArchived ? 'opacity-60' : ''
                }`}
        >
            <div className="p-6">
                <div className="flex items-start justify-between">
                    {/* Issue Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-4">
                            {/* Issue Key and Type */}
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-sm font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-700 px-2 py-1 rounded">
                                    {issue.key}
                                </span>
                                <div className="flex items-center gap-1">
                                    {getTypeIcon(issue.type)}
                                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        {issue.type}
                                    </span>
                                </div>
                            </div>

                            {/* Issue Details */}
                            <div className="flex-1 min-w-0">
                                <h3
                                    className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-pointer"
                                    onClick={() => router.push(`/projects/${projectId}/issues/${issue.id}`)}
                                >
                                    {issue.title}
                                </h3>

                                {/* Badges */}
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(issue.status)}`}>
                                        {issue.status}
                                    </span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(issue.priority)}`}>
                                        {issue.priority}
                                    </span>
                                    {issue.storyPoints && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-700 dark:text-purple-200">
                                            {issue.storyPoints} pts
                                        </span>
                                    )}
                                    {issue.labels && Array.isArray(issue.labels) && issue.labels.map((label, index) => (
                                        <span key={`${label}-${index}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-200">
                                            {label}
                                        </span>
                                    ))}
                                    {issue.isArchived && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-700 dark:bg-neutral-600 dark:text-neutral-300">
                                            <ArchiveBoxIcon className="h-3 w-3 mr-1" />
                                            Archived
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side - Assignee, Dates, Actions */}
                    <div className="flex flex-col items-end gap-4 ml-6">
                        {/* Assignee */}
                        <div className="flex items-center gap-2">
                            {getAssigneeAvatar(issue)}
                            <div className="text-right">
                                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                    {getAssigneeDisplayName(issue)}
                                </div>
                                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                    Updated {issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : '-'}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(issue);
                                }}
                                className="flex items-center gap-1"
                            >
                                <PencilSquareIcon className="h-4 w-4" />
                                Edit
                            </Button>
                            {issue.isArchived ? (
                                onUnarchive && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            setIsArchiving(true);
                                            try {
                                                await onUnarchive(issue.id);
                                            } finally {
                                                setIsArchiving(false);
                                            }
                                        }}
                                        disabled={isArchiving}
                                        className="flex items-center gap-1"
                                    >
                                        <ArchiveBoxXMarkIcon className="h-4 w-4" />
                                        {isArchiving ? 'Unarchiving...' : 'Unarchive'}
                                    </Button>
                                )
                            ) : (
                                onArchive && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            setIsArchiving(true);
                                            try {
                                                await onArchive(issue.id);
                                            } finally {
                                                setIsArchiving(false);
                                            }
                                        }}
                                        disabled={isArchiving}
                                        className="flex items-center gap-1"
                                    >
                                        <ArchiveBoxIcon className="h-4 w-4" />
                                        {isArchiving ? 'Archiving...' : 'Archive'}
                                    </Button>
                                )
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/projects/${projectId}/issues/${issue.id}`);
                                }}
                                className="flex items-center gap-1"
                            >
                                <EyeIcon className="h-4 w-4" />
                                View
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

IssueCard.displayName = 'IssueCard';

export default IssueCard;
