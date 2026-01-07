import React, { memo } from 'react';
import Image from 'next/image';
import Typography from '../Typography';
import { Issue } from '../../hooks/useProjectIssues';
import {
    Bars3Icon,
    TagIcon,
    BookmarkSquareIcon,
    CheckCircleIcon,
    BugAntIcon,
    PlusIcon,
    TrashIcon
} from '@heroicons/react/24/outline';

/**
 * Type badge configuration for different issue types
 */
export const typeBadgeConfig: Record<Issue['type'], { icon: React.ReactElement; text: string; color: string }> = {
    Epic: { icon: <TagIcon className="h-3 w-3" />, text: 'Epic', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' },
    Story: { icon: <BookmarkSquareIcon className="h-3 w-3" />, text: 'Story', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' },
    Task: { icon: <CheckCircleIcon className="h-3 w-3" />, text: 'Task', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' },
    Bug: { icon: <BugAntIcon className="h-3 w-3" />, text: 'Bug', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' },
    'Sub-task': { icon: <PlusIcon className="h-3 w-3" />, text: 'Sub-task', color: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200' },
};

/**
 * Priority badge colors
 */
const priorityColors: Record<string, string> = {
    Highest: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
    High: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
    Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
    Low: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
    Lowest: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200',
};

interface DraggableIssueCardProps {
    issue: Issue;
    isDragging?: boolean;
    showRemoveButton?: boolean;
    onRemove?: (issueId: string) => void;
    dragColor?: 'blue' | 'green';
}

/**
 * Custom equality function for React.memo
 * Only re-render when meaningful props change
 */
function arePropsEqual(
    prev: DraggableIssueCardProps,
    next: DraggableIssueCardProps
): boolean {
    return (
        prev.issue.id === next.issue.id &&
        prev.issue.title === next.issue.title &&
        prev.issue.type === next.issue.type &&
        prev.issue.priority === next.issue.priority &&
        prev.issue.storyPoints === next.issue.storyPoints &&
        prev.issue.key === next.issue.key &&
        prev.isDragging === next.isDragging &&
        prev.showRemoveButton === next.showRemoveButton &&
        prev.dragColor === next.dragColor &&
        prev.onRemove === next.onRemove
    );
}

/**
 * Draggable Issue Card Component
 * 
 * A reusable card component for displaying issues in drag-and-drop contexts.
 * Used in SprintDetailModal for sprint and backlog issue lists.
 * 
 * Extracted from SprintDetailModal for better reusability.
 */
function DraggableIssueCardComponent({
    issue,
    isDragging = false,
    showRemoveButton = false,
    onRemove,
    dragColor = 'blue'
}: DraggableIssueCardProps) {
    const typeBadge = typeBadgeConfig[issue.type] || {
        icon: <TagIcon className="h-3 w-3" />,
        text: issue.type,
        color: 'bg-neutral-100 text-neutral-700'
    };

    const dragBorderColor = dragColor === 'green' ? 'border-green-400' : 'border-blue-400';

    return (
        <div
            className={`group bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg transition-all duration-200 cursor-grab active:cursor-grabbing ${isDragging
                ? `shadow-2xl rotate-1 scale-105 z-50 ${dragBorderColor}`
                : 'hover:shadow-lg hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
        >
            <div className="p-4">
                <div className="flex items-start gap-3">
                    {/* Visual Drag Handle Indicator */}
                    <div className="mt-1 p-2 rounded-md bg-neutral-100 dark:bg-neutral-700 transition-colors group-hover:bg-neutral-200 dark:group-hover:bg-neutral-600">
                        <Bars3Icon className="h-4 w-4 text-neutral-400" />
                    </div>

                    {/* Issue Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-3">
                            <Typography variant="body" className="font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">
                                {issue.title}
                            </Typography>
                            {showRemoveButton && onRemove && (
                                <button
                                    className="ml-2 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                    aria-label="Remove from sprint"
                                    title="Remove from sprint"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('Remove this issue from the sprint?')) {
                                            onRemove(issue.id);
                                        }
                                    }}
                                >
                                    <TrashIcon className="h-4 w-4 text-red-500" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            {/* Issue Type */}
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeBadge.color}`}>
                                {typeBadge.icon}
                                {typeBadge.text}
                            </span>

                            {/* Priority */}
                            {issue.priority && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[issue.priority] || 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200'
                                    }`}>
                                    {issue.priority}
                                </span>
                            )}

                            {/* Story Points */}
                            {issue.storyPoints !== undefined && (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                                    {issue.storyPoints} pts
                                </span>
                            )}

                            {/* Issue Key */}
                            <span className="px-2 py-1 rounded text-xs font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-700">
                                {issue.key}
                            </span>
                        </div>
                    </div>

                    {/* Assignee Avatar */}
                    {issue.assignee && (
                        <AssigneeAvatar assignee={issue.assignee} />
                    )}
                </div>
            </div>
        </div>
    );
}

interface AssigneeAvatarProps {
    assignee: Issue['assignee'];
}

/**
 * Assignee Avatar Component
 */
function AssigneeAvatar({ assignee }: AssigneeAvatarProps) {
    if (!assignee) return null;

    const name = typeof assignee === 'object' ? assignee.name : assignee;
    const avatarUrl = typeof assignee === 'object' ? assignee.avatarUrl : undefined;
    const initial = assignee.name ? assignee.name[0] : '';

    return (
        <div
            className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600"
            title={name || ''}
        >
            {avatarUrl ? (
                <Image src={avatarUrl} alt={name || ''} className="w-8 h-8 object-cover" width={32} height={32} />
            ) : (
                <span>{initial}</span>
            )}
        </div>
    );
}

// Memoized DraggableIssueCard to prevent unnecessary re-renders during drag
export const DraggableIssueCard = memo(DraggableIssueCardComponent, arePropsEqual);
export default DraggableIssueCard;
