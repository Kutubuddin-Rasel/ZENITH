'use client';

import React from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';

/**
 * Types matching backend RevisionDiff
 */
export interface FieldChange {
    field: string;
    label: string;
    from: string;
    to: string;
    type: 'added' | 'removed' | 'modified';
}

export interface ActivityItem {
    entityType: string;
    entityId: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    changes: FieldChange[];
    summary: string;
    changedAt: string;
    changedBy: string;
    // Optional: populated by frontend from user lookup
    changedByName?: string;
    changedByAvatar?: string;
}

interface ActivityFeedItemProps {
    item: ActivityItem;
    showDetails?: boolean;
    onUserClick?: (userId: string) => void;
    onEntityClick?: (entityType: string, entityId: string) => void;
}

/**
 * ActivityFeedItem Component
 *
 * Renders a single activity item with human-readable diff information.
 * Supports CREATE, UPDATE, and DELETE actions with expandable change details.
 */
export function ActivityFeedItem({
    item,
    showDetails = true,
    onUserClick,
    onEntityClick,
}: ActivityFeedItemProps) {
    const [expanded, setExpanded] = React.useState(false);

    const getActionStyles = () => {
        switch (item.action) {
            case 'CREATE':
                return {
                    bg: 'bg-emerald-500/10',
                    text: 'text-emerald-400',
                    icon: '✨',
                    label: 'Created',
                };
            case 'DELETE':
                return {
                    bg: 'bg-red-500/10',
                    text: 'text-red-400',
                    icon: '🗑️',
                    label: 'Deleted',
                };
            case 'UPDATE':
            default:
                return {
                    bg: 'bg-blue-500/10',
                    text: 'text-blue-400',
                    icon: '✏️',
                    label: 'Updated',
                };
        }
    };

    const getChangeTypeStyles = (type: FieldChange['type']) => {
        switch (type) {
            case 'added':
                return 'text-emerald-400';
            case 'removed':
                return 'text-red-400';
            case 'modified':
            default:
                return 'text-amber-400';
        }
    };

    const styles = getActionStyles();
    const timeAgo = formatDistanceToNow(new Date(item.changedAt), { addSuffix: true });

    return (
        <div className="group relative py-4 hover:bg-white/[0.02] transition-colors">
            {/* Timeline connector */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10 group-first:top-4 group-last:bottom-auto group-last:h-4" />

            <div className="flex gap-4 pl-10 pr-4">
                {/* Action badge */}
                <div
                    className={`absolute left-2 mt-1 w-5 h-5 rounded-full flex items-center justify-center text-xs ${styles.bg} ${styles.text}`}
                >
                    <span>{styles.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-2 text-sm">
                        {/* User */}
                        {item.changedByAvatar ? (
                            <button
                                type="button"
                                onClick={() => onUserClick?.(item.changedBy)}
                                className="flex items-center gap-2 hover:opacity-80"
                            >
                                <div className="relative w-6 h-6 rounded-full overflow-hidden">
                                    <Image
                                        src={item.changedByAvatar}
                                        alt={item.changedByName || 'User'}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                                <span className="font-medium text-white/90">
                                    {item.changedByName || 'User'}
                                </span>
                            </button>
                        ) : (
                            <span className="font-medium text-white/90">
                                {item.changedByName || 'User'}
                            </span>
                        )}

                        {/* Action */}
                        <span className={`font-medium ${styles.text}`}>
                            {styles.label.toLowerCase()}
                        </span>

                        {/* Entity type */}
                        <button
                            type="button"
                            onClick={() => onEntityClick?.(item.entityType, item.entityId)}
                            className="text-white/60 hover:text-white/90 hover:underline lowercase"
                        >
                            {item.entityType}
                        </button>

                        {/* Timestamp */}
                        <span className="text-white/40 text-xs ml-auto">{timeAgo}</span>
                    </div>

                    {/* Summary */}
                    <p className="mt-1 text-sm text-white/70">{item.summary}</p>

                    {/* Expandable details */}
                    {showDetails && item.changes.length > 0 && item.action === 'UPDATE' && (
                        <>
                            <button
                                type="button"
                                onClick={() => setExpanded(!expanded)}
                                className="mt-2 text-xs text-white/40 hover:text-white/60 flex items-center gap-1"
                            >
                                <svg
                                    className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                {expanded ? 'Hide' : 'Show'} {item.changes.length} change
                                {item.changes.length !== 1 ? 's' : ''}
                            </button>

                            {expanded && (
                                <div className="mt-3 pl-3 border-l border-white/10 space-y-2">
                                    {item.changes.map((change, idx) => (
                                        <div key={idx} className="text-xs">
                                            <span className="text-white/50">{change.label}:</span>
                                            <span className="ml-2">
                                                <span className="text-white/40 line-through">{change.from}</span>
                                                <span className={`mx-1 ${getChangeTypeStyles(change.type)}`}>→</span>
                                                <span className="text-white/90">{change.to}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * ActivityFeed Component
 *
 * Container for a list of activity items with timeline visualization.
 */
interface ActivityFeedProps {
    items: ActivityItem[];
    loading?: boolean;
    emptyMessage?: string;
    onLoadMore?: () => void;
    hasMore?: boolean;
}

export function ActivityFeed({
    items,
    loading = false,
    emptyMessage = 'No activity yet',
    onLoadMore,
    hasMore = false,
}: ActivityFeedProps) {
    if (loading && items.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="text-center py-12 text-white/40">
                <div className="text-3xl mb-2">📋</div>
                <p>{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="relative">
            {items.map((item, index) => (
                <ActivityFeedItem
                    key={`${item.entityId}-${item.changedAt}-${index}`}
                    item={item}
                />
            ))}

            {hasMore && (
                <div className="py-4 text-center">
                    <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loading}
                        className="text-sm text-white/60 hover:text-white/90 disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : 'Load more'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default ActivityFeedItem;
