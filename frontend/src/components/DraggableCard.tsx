// components/DraggableCard.tsx
// Unified draggable card component for both list and board views

'use client';
import React, { memo } from 'react';
import Image from 'next/image';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Issue } from '@/hooks/useProjectIssues';
import { LIFT_ANIMATION, LIST_LIFT_ANIMATION, REST_ANIMATION, HOVER_ANIMATION } from '@/lib/drag-physics';
import { IssueTypeIcon, StatusDot } from '@/lib/issue-utils';
import { UserIcon } from '@heroicons/react/24/outline';

export type DragContext =
    | { type: 'backlog' }
    | { type: 'sprint'; sprintId: string }
    | { type: 'board'; boardId: string; columnId: string };

export interface DraggableCardProps {
    issue: Issue;
    context: DragContext;
    variant: 'list' | 'card';
    onRemove?: () => void;
    isOverlay?: boolean;
}

const priorityColors = {
    Highest: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/20 dark:text-red-300',
    High: 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-900/20 dark:text-orange-300',
    Medium: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-300',
    Low: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/20 dark:text-green-300',
    Lowest: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300',
} as const;

/**
 * Custom equality function for React.memo
 * Only re-render when meaningful props change
 */
function arePropsEqual(
    prev: DraggableCardProps,
    next: DraggableCardProps
): boolean {
    return (
        prev.issue.id === next.issue.id &&
        prev.issue.status === next.issue.status &&
        prev.issue.title === next.issue.title &&
        prev.issue.priority === next.issue.priority &&
        prev.issue.storyPoints === next.issue.storyPoints &&
        prev.issue.assignee?.id === next.issue.assignee?.id &&
        prev.variant === next.variant &&
        prev.isOverlay === next.isOverlay &&
        prev.onRemove === next.onRemove
    );
}

function DraggableCardComponent({
    issue,
    context,
    variant,
    isOverlay = false
}: DraggableCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: issue.id,
        data: {
            issue,
            context,
            type: 'issue'
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging && !isOverlay ? 0.3 : 1,
    };

    // Determine animation state - use LIST_LIFT_ANIMATION for list variant (smaller scale)
    const liftAnim = variant === 'list' ? LIST_LIFT_ANIMATION : LIFT_ANIMATION;
    const animationState = isOverlay
        ? liftAnim
        : isDragging
            ? REST_ANIMATION
            : REST_ANIMATION;

    if (variant === 'list') {
        return (
            <motion.div
                ref={isOverlay ? undefined : setNodeRef}
                style={isOverlay ? undefined : style}
                animate={animationState}
                whileHover={!isDragging && !isOverlay ? HOVER_ANIMATION : undefined}
                className={`
          group relative select-none touch-none
          ${isOverlay ? 'cursor-grabbing shadow-2xl scale-105 ring-2 ring-primary-500' : 'cursor-grab active:cursor-grabbing'}
        `}
                {...(isOverlay ? {} : { ...attributes, ...listeners })}
            >
                <div className={`
          flex items-center gap-4 p-3 
          bg-white dark:bg-neutral-800 
          border border-neutral-100 dark:border-neutral-700 
          shadow-sm rounded-lg 
          group-hover:border-primary-300 dark:group-hover:border-primary-700 
          group-hover:shadow-md
          transition-all duration-200
        `}>
                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-7 flex items-center gap-3">
                            <IssueTypeIcon type={issue.type} className="h-4 w-4 flex-shrink-0" />
                            <span className="font-mono text-xs font-semibold text-neutral-500 dark:text-neutral-400 w-16 shrink-0">
                                {issue.key}
                            </span>
                            <span className="font-medium text-sm text-neutral-900 dark:text-white truncate" title={issue.title}>
                                {issue.title}
                            </span>
                        </div>

                        <div className="col-span-5 flex items-center justify-end gap-3">
                            {/* Status */}
                            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-700/50">
                                <StatusDot status={issue.status} className="h-2.5 w-2.5" />
                                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{issue.status}</span>
                            </div>

                            {/* Priority */}
                            {issue.priority && (
                                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ring-1 ring-inset ${priorityColors[issue.priority as keyof typeof priorityColors] || 'bg-neutral-50 text-neutral-600'}`}>
                                    {issue.priority}
                                </span>
                            )}

                            {/* Story Points */}
                            {issue.storyPoints !== undefined && issue.storyPoints > 0 && (
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                                    {issue.storyPoints}
                                </span>
                            )}

                            {/* Assignee */}
                            <AssigneeAvatar assignee={issue.assignee} />
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    // Card variant (for Kanban boards)
    return (
        <motion.div
            ref={isOverlay ? undefined : setNodeRef}
            style={isOverlay ? undefined : style}
            animate={animationState}
            whileHover={!isDragging && !isOverlay ? HOVER_ANIMATION : undefined}
            className={`
        group relative select-none touch-none
        ${isOverlay ? 'cursor-grabbing shadow-2xl scale-105 rotate-2 ring-2 ring-primary-500' : 'cursor-grab active:cursor-grabbing'}
      `}
            {...(isOverlay ? {} : { ...attributes, ...listeners })}
        >
            <div className={`
        p-3 
        bg-white dark:bg-neutral-800 
        border border-neutral-200 dark:border-neutral-700 
        shadow-sm rounded-lg 
        hover:shadow-md 
        transition-all duration-200
      `}>
                {/* Top row: type and priority badges */}
                <div className="flex items-center gap-2 mb-2">
                    <IssueTypeIcon type={issue.type} className="h-4 w-4 opacity-80" />
                    <span className="font-mono text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {issue.key}
                    </span>
                </div>

                {/* Title */}
                <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3 line-clamp-2 leading-relaxed">
                    {issue.title}
                </h4>

                {/* Badges Row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    {issue.priority && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${priorityColors[issue.priority as keyof typeof priorityColors] || 'bg-neutral-100 text-neutral-600'}`}>
                            {issue.priority}
                        </span>
                    )}

                    {/* Status Dot */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700/50">
                        <StatusDot status={issue.status} className="h-1.5 w-1.5" />
                        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{issue.status}</span>
                    </div>

                    {/* Story Points */}
                    {issue.storyPoints !== undefined && issue.storyPoints > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-[10px] font-bold border border-blue-100 dark:border-blue-900/30">
                            {issue.storyPoints}
                        </span>
                    )}
                </div>

                {/* Bottom row: Assignee */}
                <div className="flex items-center justify-end">
                    <AssigneeAvatar assignee={issue.assignee} size="sm" />
                </div>
            </div>
        </motion.div>
    );
}

// Memoized DraggableCard to prevent unnecessary re-renders during drag
export const DraggableCard = memo(DraggableCardComponent, arePropsEqual);

// Reusable Assignee Avatar
function AssigneeAvatar({
    assignee,
    size = 'md'
}: {
    assignee: Issue['assignee'];
    size?: 'sm' | 'md';
}) {
    const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';

    if (!assignee) {
        return (
            <div className={`${sizeClasses} rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-400`}>
                <UserIcon className="w-3 h-3" />
            </div>
        );
    }

    if (typeof assignee === 'object') {
        return (
            <div className={`${sizeClasses} rounded-full ring-2 ring-white dark:ring-neutral-800 shadow-sm overflow-hidden`}>
                {assignee.avatarUrl ? (
                    <Image
                        src={assignee.avatarUrl}
                        alt={assignee.name || ''}
                        className="w-full h-full object-cover"
                        width={size === 'sm' ? 24 : 28}
                        height={size === 'sm' ? 24 : 28}
                        sizes="32px"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 flex items-center justify-center text-[10px] font-bold text-primary-700 dark:text-primary-300">
                        {assignee.name?.[0] || '?'}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`${sizeClasses} rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden ring-2 ring-white dark:ring-neutral-800`}>
            <span>{String(assignee)[0]?.toUpperCase() || '?'}</span>
        </div>
    );
}

// DragOverlay wrapper for proper styling during drag
export function DragOverlayCard({ issue, context, variant }: Omit<DraggableCardProps, 'isOverlay'>) {
    return (
        <DraggableCard
            issue={issue}
            context={context}
            variant={variant}
            isOverlay={true}
        />
    );
}
