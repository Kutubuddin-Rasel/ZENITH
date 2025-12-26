// Unified drag-and-drop hook for all contexts

'use client';
import { useState, useCallback } from 'react';
import {
    useSensor,
    useSensors,
    PointerSensor,
    KeyboardSensor,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';
import { Issue } from '@/hooks/useProjectIssues';
import { DRAG_ACTIVATION_CONSTRAINT } from '@/lib/drag-physics';

// Types
export type DragContext =
    | { type: 'backlog' }
    | { type: 'sprint'; sprintId: string }
    | { type: 'board'; boardId: string; columnId?: string };

export interface DragItem {
    issue: Issue;
    sourceContext: DragContext;
    sourcePosition: number;
}

export interface DropTarget {
    context: DragContext;
    position: number;
    statusId?: string;
    statusName?: string;
}

interface MoveIssuePayload {
    targetSprintId?: string | null;
    targetStatusId?: string;
    targetPosition?: number;
    expectedVersion?: number;
}

export interface UseZenithDragOptions {
    projectId: string;
    context: DragContext;
    onMoveComplete?: () => void;
    onMoveError?: (error: Error) => void;
}

export interface UseZenithDragReturn {
    sensors: ReturnType<typeof useSensors>;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragEnd: (event: DragEndEvent) => void;
    handleDragOver: (event: DragOverEvent) => void;
    activeItem: DragItem | null;
    isMoving: boolean;
}

/**
 * Unified drag-and-drop hook that handles all contexts:
 * - Backlog: Reorder within backlog, move to/from sprints
 * - Sprint: Move between sprints, move to/from backlog
 * - Board: Move between columns, reorder within columns
 */
export function useZenithDrag({
    projectId,
    context,
    onMoveComplete,
    onMoveError,
}: UseZenithDragOptions): UseZenithDragReturn {
    const queryClient = useQueryClient();
    const [activeItem, setActiveItem] = useState<DragItem | null>(null);

    // Configure sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: DRAG_ACTIVATION_CONSTRAINT,
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Unified move mutation
    const moveIssue = useMutation({
        mutationFn: async ({ issueId, payload }: { issueId: string; payload: MoveIssuePayload }) => {
            return apiFetch(`/projects/${projectId}/issues/${issueId}/move`, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['project-issues', projectId] });
            await queryClient.cancelQueries({ queryKey: ['backlog', projectId] });
            await queryClient.cancelQueries({ queryKey: ['sprint-issues'] });

            // Snapshot state for rollback
            const snapshots = {
                projectIssues: queryClient.getQueryData(['project-issues', projectId]),
                backlog: queryClient.getQueryData(['backlog', projectId]),
            };

            return { snapshots };
        },
        onError: (err, variables, rollbackContext) => {
            // Rollback on failure
            if (rollbackContext?.snapshots) {
                const { snapshots } = rollbackContext;
                if (snapshots.projectIssues) {
                    queryClient.setQueryData(['project-issues', projectId], snapshots.projectIssues);
                }
                if (snapshots.backlog) {
                    queryClient.setQueryData(['backlog', projectId], snapshots.backlog);
                }
            }
            onMoveError?.(err as Error);
        },
        onSettled: () => {
            // Invalidate queries to sync with server
            queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
            queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
            queryClient.invalidateQueries({ queryKey: ['sprint-issues'] });
            onMoveComplete?.();
        },
    });

    // Sprint assignment mutations
    const assignToSprint = useMutation({
        mutationFn: async ({ issueId, sprintId }: { issueId: string; sprintId: string }) => {
            return apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
                method: 'POST',
                body: JSON.stringify({ issueId }),
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, variables.sprintId] });
            queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
        },
    });

    const removeFromSprint = useMutation({
        mutationFn: async ({ issueId, sprintId }: { issueId: string; sprintId: string }) => {
            return apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
                method: 'DELETE',
                body: JSON.stringify({ issueId }),
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, variables.sprintId] });
            queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
        },
    });

    // Status update mutation
    const updateStatus = useMutation({
        mutationFn: async ({ issueId, statusId, status }: { issueId: string; statusId?: string; status?: string }) => {
            return apiFetch(`/projects/${projectId}/issues/${issueId}`, {
                method: 'PATCH',
                body: JSON.stringify({ statusId, status }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
        },
    });

    // Reorder mutations
    const reorderBacklog = useMutation({
        mutationFn: async (issueIds: string[]) => {
            return apiFetch(`/projects/${projectId}/backlog/reorder`, {
                method: 'POST',
                body: JSON.stringify({ issueIds }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
        },
    });

    // Handle drag start
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const data = active.data.current as { issue: Issue; context: DragContext } | undefined;

        if (data?.issue) {
            setActiveItem({
                issue: data.issue,
                sourceContext: data.context || context,
                sourcePosition: 0, // Will be determined by drop target
            });
        }
    }, [context]);

    // Handle drag over (for live feedback)
    const handleDragOver = useCallback(() => {
        // Available for visual feedback while dragging
    }, []);

    // Handle drag end - the main logic dispatcher
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveItem(null);

        if (!over) return;

        const activeData = active.data.current as { issue: Issue; context: DragContext } | undefined;
        if (!activeData) return;

        const activeId = active.id as string;
        const overId = over.id as string;
        const overData = over.data.current as { context?: DragContext; sprintId?: string; statusId?: string } | undefined;

        const sourceContext = activeData.context || context;

        // Determine target context from drop target
        let targetContext: DragContext | null = null;
        let targetStatusId: string | undefined;

        // Check if dropped on a sprint container
        if (overId.startsWith('sprint-')) {
            const sprintId = overId.replace('sprint-', '');
            targetContext = { type: 'sprint', sprintId };
        }
        // Check if dropped on backlog zone
        else if (overId === 'backlog-container-droppable' || overId === 'backlog-drop-zone' || overId === 'backlog-list') {
            targetContext = { type: 'backlog' };
        }
        // Check if target is an issue with context data
        else if (overData?.context) {
            targetContext = overData.context;
        }
        // Check if dropped on a board column
        else if (overData?.statusId) {
            targetStatusId = overData.statusId;
            if (context.type === 'board') {
                targetContext = context;
            }
        }

        // Dispatch to appropriate handler based on source and target
        if (targetContext) {
            // Inline logic to avoid stale closures
            if (!isSameContext(sourceContext, targetContext)) {
                // Backlog -> Sprint
                if (sourceContext.type === 'backlog' && targetContext.type === 'sprint') {
                    assignToSprint.mutate({ issueId: activeId, sprintId: targetContext.sprintId });
                    return;
                }
                // Sprint -> Backlog
                if (sourceContext.type === 'sprint' && targetContext.type === 'backlog') {
                    removeFromSprint.mutate({ issueId: activeId, sprintId: sourceContext.sprintId });
                    return;
                }
                // Sprint -> Sprint (different sprints) - sequential with onSuccess
                if (sourceContext.type === 'sprint' && targetContext.type === 'sprint') {
                    const destSprintId = targetContext.sprintId;
                    removeFromSprint.mutate(
                        { issueId: activeId, sprintId: sourceContext.sprintId },
                        {
                            onSuccess: () => {
                                assignToSprint.mutate({ issueId: activeId, sprintId: destSprintId });
                            },
                        }
                    );
                    return;
                }
                // Board column move with status change
                if (targetStatusId) {
                    updateStatus.mutate({ issueId: activeId, statusId: targetStatusId });
                }
            }
        } else if (sourceContext.type === 'board' && targetStatusId) {
            // Board column move
            updateStatus.mutate({
                issueId: activeId,
                statusId: targetStatusId
            });
        }
    }, [context, assignToSprint, removeFromSprint, updateStatus]);

    const isMoving = moveIssue.isPending || assignToSprint.isPending || removeFromSprint.isPending || updateStatus.isPending;

    return {
        sensors,
        handleDragStart,
        handleDragEnd,
        handleDragOver,
        activeItem,
        isMoving,
    };
}

// Helper: Check if two contexts are the same
function isSameContext(a: DragContext, b: DragContext): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'sprint' && b.type === 'sprint') {
        return a.sprintId === b.sprintId;
    }
    if (a.type === 'board' && b.type === 'board') {
        return a.boardId === b.boardId && a.columnId === b.columnId;
    }
    return true; // Both backlog
}

// Export context creators for convenience
export const createBacklogContext = (): DragContext => ({ type: 'backlog' });
export const createSprintContext = (sprintId: string): DragContext => ({ type: 'sprint', sprintId });
export const createBoardContext = (boardId: string, columnId?: string): DragContext => ({
    type: 'board',
    boardId,
    columnId
});
