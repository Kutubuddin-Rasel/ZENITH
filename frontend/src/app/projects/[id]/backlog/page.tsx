"use client";
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useBacklog } from '@/hooks/useBacklog';
import { useSprints } from '@/hooks/useSprints';

import { useSprintAssignments } from '@/hooks/useSprintAssignments';
import { DraggableCard, DragOverlayCard, DragContext } from '@/components/DraggableCard';
import { DROP_ANIMATION, DRAG_ACTIVATION_CONSTRAINT } from '@/lib/drag-physics';
import { Issue } from '@/hooks/useProjectIssues';
import Typography from '@/components/Typography';
import Button from '@/components/Button';
import Spinner from '@/components/Spinner';
import {

  ChevronDownIcon,
  ChevronRightIcon,
  InboxStackIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// DROPPABLE CONTAINERS
// ============================================================================

interface DroppableBacklogZoneProps {
  children: React.ReactNode;
  id: string;
  isOver: boolean;
}

function DroppableBacklogZone({ children, id, isOver }: DroppableBacklogZoneProps) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[200px] rounded-lg transition-all duration-200
        ${isOver ? 'bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-400' : ''}
      `}
    >
      {children}
    </div>
  );
}

interface DroppableSprintContainerProps {
  sprint: { id: string; name: string; status: string };
  issues: Issue[];
  isOver: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  projectId: string;
}

function DroppableSprintContainer({
  sprint,
  issues,
  isOver,
  isExpanded,
  onToggle,
  projectId,
}: DroppableSprintContainerProps) {
  const { setNodeRef } = useDroppable({
    id: `sprint-${sprint.id}`,
    data: { type: 'sprint-container', sprintId: sprint.id }
  });

  const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
  const context: DragContext = { type: 'sprint', sprintId: sprint.id };

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-lg border transition-all duration-200
        ${isOver
          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-400 ring-2 ring-blue-400 ring-opacity-50'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
        }
      `}
    >
      {/* Sprint Header - Valid Drop Target */}
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center justify-between p-4 
          text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 
          rounded-t-lg transition-colors
          ${isOver ? 'bg-blue-100/50 dark:bg-blue-900/20' : ''}
        `}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDownIcon className="h-5 w-5 text-neutral-400" />
          ) : (
            <ChevronRightIcon className="h-5 w-5 text-neutral-400" />
          )}
          <Typography variant="h4" className="text-neutral-800 dark:text-white font-semibold">
            {sprint.name}
          </Typography>
          <span className={`
            px-2 py-0.5 rounded-full text-xs font-medium
            ${sprint.status === 'active'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'}
          `}>
            {sprint.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
          <span>{issues.length} issues</span>
          <span>{totalPoints} pts</span>
        </div>
      </button>

      {/* Sprint Issues List */}
      {isExpanded && (
        <div className="border-t border-neutral-100 dark:border-neutral-700 p-3">
          {issues.length === 0 ? (
            <div className={`
              flex items-center justify-center p-8 text-neutral-400 
              ${isOver ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}
            `}>
              <InboxStackIcon className="h-6 w-6 mr-2" />
              <span>Drop issues here to add to sprint</span>
            </div>
          ) : (
            <SortableContext items={issues.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {issues.map(issue => (
                  <DraggableCard
                    key={issue.id}
                    issue={issue}
                    context={context}
                    variant="list"
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN BACKLOG PAGE
// ============================================================================

export default function BacklogPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  // Data fetching
  const { issues: backlogIssues, isLoading: loadingBacklog, reorderBacklog } = useBacklog(projectId);
  const { sprints, isLoading: loadingSprints } = useSprints(projectId);
  const { assignToSprint, removeFromSprint } = useSprintAssignments(projectId);

  // UI State
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<{ issue: Issue; context: DragContext } | null>(null);
  const [overSprintId, setOverSprintId] = useState<string | null>(null);
  const [isOverBacklog, setIsOverBacklog] = useState(false);

  // Get active/planned sprints only
  const activeSprints = useMemo(() =>
    (sprints || []).filter(s => s.status === 'ACTIVE' || s.status === 'PLANNED'),
    [sprints]
  );

  // Fetch issues for each sprint
  const sprintIssuesMap = useMemo(() => {
    const map = new Map<string, Issue[]>();
    activeSprints.forEach(sprint => {
      map.set(sprint.id, []);
    });
    return map;
  }, [activeSprints]);

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: DRAG_ACTIVATION_CONSTRAINT,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Toggle sprint expansion
  const toggleSprint = useCallback((sprintId: string) => {
    setExpandedSprints(prev => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
      }
      return next;
    });
  }, []);

  // =========================================================================
  // DRAG HANDLERS
  // =========================================================================

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { issue: Issue; context: DragContext } | undefined;
    if (data?.issue) {
      setActiveItem(data);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;

    if (!over) {
      setOverSprintId(null);
      setIsOverBacklog(false);
      return;
    }

    const overId = String(over.id);

    // Check if over a sprint container
    if (overId.startsWith('sprint-')) {
      setOverSprintId(overId.replace('sprint-', ''));
      setIsOverBacklog(false);
    } else if (overId === 'backlog-drop-zone') {
      setOverSprintId(null);
      setIsOverBacklog(true);
    } else {
      // Over an issue - check its context
      const overData = over.data.current as { context?: DragContext } | undefined;
      if (overData?.context?.type === 'sprint') {
        setOverSprintId(overData.context.sprintId);
        setIsOverBacklog(false);
      } else if (overData?.context?.type === 'backlog') {
        setOverSprintId(null);
        setIsOverBacklog(true);
      }
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Reset visual state
    setActiveItem(null);
    setOverSprintId(null);
    setIsOverBacklog(false);

    if (!over) return;

    const activeData = active.data.current as { issue: Issue; context: DragContext } | undefined;
    if (!activeData) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sourceContext = activeData.context;

    // Determine target
    let targetSprintId: string | null = null;
    let targetIsBacklog = false;

    if (overId.startsWith('sprint-')) {
      targetSprintId = overId.replace('sprint-', '');
    } else if (overId === 'backlog-drop-zone') {
      targetIsBacklog = true;
    } else {
      const overData = over.data.current as { context?: DragContext } | undefined;
      if (overData?.context?.type === 'sprint') {
        targetSprintId = overData.context.sprintId;
      } else if (overData?.context?.type === 'backlog') {
        targetIsBacklog = true;
      }
    }

    // =========================================================================
    // OPTIMISTIC UPDATES + API CALLS
    // =========================================================================

    // Case 1: Backlog → Sprint (assign to sprint)
    if (sourceContext.type === 'backlog' && targetSprintId) {
      // Optimistic: Remove from backlog immediately
      queryClient.setQueryData<Issue[]>(['backlog', projectId], prev =>
        prev ? prev.filter(i => i.id !== activeId) : []
      );

      // API call
      assignToSprint.mutate({ issueId: activeId, sprintId: targetSprintId });
      return;
    }

    // Case 2: Sprint → Backlog (unplan from sprint)
    if (sourceContext.type === 'sprint' && targetIsBacklog) {
      const sourceSprintId = sourceContext.sprintId;

      // Optimistic: Add to backlog immediately
      const movedIssue = activeData.issue;
      queryClient.setQueryData<Issue[]>(['backlog', projectId], prev =>
        prev ? [...prev, movedIssue] : [movedIssue]
      );

      // API call
      removeFromSprint.mutate({ issueId: activeId, sprintId: sourceSprintId });
      return;
    }

    // Case 3: Sprint A → Sprint B (move between sprints)
    if (sourceContext.type === 'sprint' && targetSprintId && sourceContext.sprintId !== targetSprintId) {
      const sourceSprintId = sourceContext.sprintId;

      // API calls (sequential)
      removeFromSprint.mutate(
        { issueId: activeId, sprintId: sourceSprintId },
        {
          onSuccess: () => {
            assignToSprint.mutate({ issueId: activeId, sprintId: targetSprintId });
          },
        }
      );
      return;
    }

    // Case 4: Reorder within backlog
    if (sourceContext.type === 'backlog' && targetIsBacklog && backlogIssues) {
      const oldIndex = backlogIssues.findIndex(i => i.id === activeId);
      const newIndex = backlogIssues.findIndex(i => i.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(backlogIssues, oldIndex, newIndex).map(i => i.id);
        reorderBacklog.mutate(newOrder);
      }
    }
  }, [projectId, queryClient, assignToSprint, removeFromSprint, backlogIssues, reorderBacklog]);

  // =========================================================================
  // RENDER
  // =========================================================================

  if (loadingBacklog || loadingSprints) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Loading backlog...
          </Typography>
        </div>
      </div>
    );
  }

  const backlogContext: DragContext = { type: 'backlog' };
  const backlogList = backlogIssues || [];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <Typography variant="h2" className="text-neutral-900 dark:text-white font-bold">
              Backlog
            </Typography>
            <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 mt-1">
              Drag issues to sprints or reorder the backlog
            </Typography>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push(`/projects/${projectId}/issues/new`)}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Issue
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Backlog Column */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <div className="bg-neutral-50 dark:bg-neutral-800 px-4 py-3 border-b border-neutral-100 dark:border-neutral-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <InboxStackIcon className="h-5 w-5 text-neutral-400" />
                      <Typography variant="h4" className="text-neutral-700 dark:text-neutral-200 font-semibold">
                        Backlog
                      </Typography>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                        {backlogList.length}
                      </span>
                    </div>
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      {backlogList.reduce((sum, i) => sum + (i.storyPoints || 0), 0)} pts
                    </span>
                  </div>
                </div>

                <DroppableBacklogZone id="backlog-drop-zone" isOver={isOverBacklog}>
                  <div className="p-4">
                    {backlogList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                        <InboxStackIcon className="h-12 w-12 mb-3 opacity-50" />
                        <Typography variant="body" className="text-center">
                          No issues in the backlog
                        </Typography>
                        <Typography variant="body-sm" className="text-center mt-1">
                          Create issues or unplan them from sprints
                        </Typography>
                      </div>
                    ) : (
                      <SortableContext items={backlogList.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {backlogList.map(issue => (
                            <DraggableCard
                              key={issue.id}
                              issue={issue}
                              context={backlogContext}
                              variant="list"
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </div>
                </DroppableBacklogZone>
              </div>
            </div>

            {/* Sprints Column */}
            <div className="space-y-4">
              <Typography variant="h4" className="text-neutral-700 dark:text-neutral-200 font-semibold px-1">
                Sprints
              </Typography>

              {activeSprints.length === 0 ? (
                <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6 text-center text-neutral-400">
                  <Typography variant="body">No active or planned sprints</Typography>
                </div>
              ) : (
                activeSprints.map(sprint => {
                  // Get sprint issues from hook
                  const sprintIssues = sprintIssuesMap.get(sprint.id) || [];

                  return (
                    <DroppableSprintContainer
                      key={sprint.id}
                      sprint={sprint}
                      issues={sprintIssues}
                      isOver={overSprintId === sprint.id}
                      isExpanded={expandedSprints.has(sprint.id)}
                      onToggle={() => toggleSprint(sprint.id)}
                      projectId={projectId}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={DROP_ANIMATION}>
            {activeItem ? (
              <DragOverlayCard
                issue={activeItem.issue}
                context={activeItem.context}
                variant="list"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}