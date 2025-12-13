"use client";
import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useBacklog } from '@/hooks/useBacklog';
import { useSprints, Sprint } from '@/hooks/useSprints';
import { useSprintIssues } from '@/hooks/useSprintIssues';
import { useSprintAssignments } from '@/hooks/useSprintAssignments';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Spinner from '@/components/Spinner';
import Typography from '@/components/Typography';
import CreateIssueModal from '@/components/CreateIssueModal';
import { PlusIcon, ChevronDownIcon, ChevronRightIcon, CalendarIcon, EllipsisHorizontalIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { Issue } from '@/hooks/useProjectIssues';

// -- Components --

// Components
function IssueRow({ issue, isOverlay, sourceSprintId }: { issue: Issue; isOverlay?: boolean, sourceSprintId?: string }) {
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
      sourceSprintId, // Track where this issue is coming from
      type: 'issue'
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const priorityColors = {
    Highest: 'bg-red-50 text-red-700 ring-red-600/20',
    High: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    Medium: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
    Low: 'bg-green-50 text-green-700 ring-green-600/20',
    Lowest: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  } as const;



  const content = (
    // Added cursor-grab and listeners to the main container
    <div
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-lg group hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-200 select-none ${isOverlay ? 'cursor-grabbing shadow-xl scale-105 ring-1 ring-primary-500' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div className="text-gray-300 group-hover:text-primary-500 transition-colors p-1">
        <Bars3Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
        <div className="col-span-8 flex items-center gap-3">
          <span className="font-mono text-xs font-semibold text-gray-500 dark:text-gray-400 w-16 shrink-0">{issue.key}</span>
          <span className="font-medium text-sm text-gray-900 dark:text-white truncate" title={issue.title}>{issue.title}</span>
        </div>

        <div className="col-span-4 flex items-center justify-end gap-2">
          {issue.priority && (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ring-1 ring-inset ${priorityColors[issue.priority as keyof typeof priorityColors] || 'bg-gray-50 text-gray-600 ring-gray-500/10'}`}>
              {issue.priority}
            </span>
          )}
          {issue.storyPoints !== undefined && (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300">
              {issue.storyPoints ?? '-'}
            </span>
          )}
          <div className="flex -space-x-1">
            {issue.assignee ? (
              issue.assignee.avatarUrl ? (
                <Image src={issue.assignee.avatarUrl} alt="" width={24} height={24} className="rounded-full ring-2 ring-white dark:ring-gray-800" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-bold ring-2 ring-white dark:ring-gray-800">
                  {issue.assignee.name?.[0] || '?'}
                </div>
              )
            ) : (
              <div className="w-6 h-6 rounded-full border border-dashed border-gray-300 flex items-center justify-center">
                <span className="text-gray-300 text-[10px]">+</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (isOverlay) return content;

  return (
    <div ref={setNodeRef} style={style} className="mb-2 last:mb-0 touch-none">
      {content}
    </div>
  );
}

function SprintContainer({ sprint, projectId }: { sprint: Sprint; projectId: string }) {
  const { issues, isLoading } = useSprintIssues(projectId, sprint.id);
  // Default to expanded for active sprints
  const [isExpanded, setIsExpanded] = useState(true);
  const { setNodeRef, isOver } = useDroppable({
    id: `sprint-${sprint.id}`,
    data: { type: 'sprint', sprintId: sprint.id }
  });

  const issueIds = useMemo(() => issues?.map(i => i.id) || [], [issues]);
  const isActive = sprint.status === 'ACTIVE';

  return (
    <div ref={setNodeRef} className={`rounded-xl border transition-all duration-300 overflow-hidden ${isOver ? 'ring-2 ring-primary-500 border-primary-500 shadow-lg bg-primary-50/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'}`}>
      <div
        className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors ${isActive ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{sprint.name}</h3>
              {isActive && <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">Active</span>}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
              {sprint.startDate && sprint.endDate && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()}
                </span>
              )}
              <span>{issues?.length || 0} issues</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-gray-200 dark:bg-gray-700 h-1.5 w-24 rounded-full overflow-hidden">
            <div className="bg-indigo-500 h-full w-[45%]" />
          </div>
          <button className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="p-3 bg-gray-100/50 dark:bg-black/20 inner-shadow-sm min-h-[60px]">
          {isLoading ? <div className="p-4 flex justify-center"><Spinner className="h-5 w-5 text-indigo-500" /></div> : (
            <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {issues?.length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 flex flex-col items-center justify-center text-gray-400 bg-white/50 dark:bg-gray-800/50">
                    <p className="text-xs font-medium">Plan this sprint</p>
                    <p className="text-[10px]">Drag issues from the backlog here</p>
                  </div>
                )}
                {issues?.map(issue => (
                  <IssueRow key={issue.id} issue={issue} sourceSprintId={sprint.id} />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      </div>
    </div>
  );
}

// Explicit Drop Zone Component
function BacklogDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog-drop-zone',
    data: { type: 'backlog-zone' }
  });

  return (
    <div
      ref={setNodeRef}
      className={`mb-4 border-2 border-dashed rounded-lg p-4 flex items-center justify-center transition-all duration-200 ${isOver
        ? 'border-primary-500 bg-primary-50 text-primary-700 scale-[1.02] shadow-md'
        : 'border-gray-200 dark:border-gray-700 text-gray-400 bg-gray-50/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <ArrowDownTrayIcon className="h-5 w-5" />
        <span>Drop issues here to move to Backlog</span>
      </div>
    </div>
  );
}

export default function BacklogPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { issues: backlogIssues, isLoading: backlogLoading, reorderBacklog } = useBacklog(projectId);
  const { sprints, isLoading: sprintsLoading } = useSprints(projectId);
  const { assignToSprint, removeFromSprint } = useSprintAssignments(projectId);


  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [isDraggingFromSprint, setIsDraggingFromSprint] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Memoized lists
  const activeOrPlannedSprints = useMemo(() =>
    sprints?.filter(s => s.status === 'ACTIVE' || s.status === 'PLANNED') || [],
    [sprints]);

  const backlogIssueIds = useMemo(() => backlogIssues?.map((i: Issue) => i.id) || [], [backlogIssues]);

  // Make the entire backlog area droppable
  const { setNodeRef: setBacklogDroppableRef, isOver: isOverBacklogContainer } = useDroppable({
    id: 'backlog-container-droppable',
    data: { type: 'backlog' }
  });

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;

    setActiveIssue(active.data.current?.issue as Issue);
    // distinct UI state for sprint -> backlog drag
    if (active.data.current?.sourceSprintId) {
      setIsDraggingFromSprint(true);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveIssue(null);
    setIsDraggingFromSprint(false);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Determine Source and Target Sprint
    const sourceSprintId = active.data.current?.sourceSprintId;
    let targetSprintId: string | undefined = undefined;

    if (String(overId).startsWith('sprint-')) {
      targetSprintId = String(overId).replace('sprint-', '');
    } else if (over.data.current?.sourceSprintId) {
      // Dropped ON an issue within a sprint -> target is that sprint
      targetSprintId = over.data.current.sourceSprintId;
    }

    // Case 1: Sprint Drop (Assign or Move)
    if (targetSprintId) {
      if (sourceSprintId === targetSprintId) {
        // Reorder within SAME sprint
        // Visual only for now (Backend support pending)
        // Ideally call reorderSprintIssues(sprintId, newOrder)
        return;
      }
      // Move to different Sprint (or from Backlog to Sprint)
      assignToSprint.mutate({ issueId: activeId, sprintId: targetSprintId });
      return;
    }

    // Case 2: Backlog Drop (Unplan or Backlog Reorder)
    // We consider it a "Backlog Drop" if:
    // 1. Dropped on the 'backlog-container-droppable' (empty space)
    // 2. Dropped on 'backlog-list' (the list container)
    // 3. Dropped on 'backlog-drop-zone' (the explicit box)
    // 4. Dropped on ANY issue currently in the backlog
    const isOverBacklog =
      overId === 'backlog-container-droppable' ||
      overId === 'backlog-list' ||
      overId === 'backlog-drop-zone' ||
      backlogIssues?.some(i => i.id === overId);

    if (isOverBacklog) {
      // If coming from a sprint, Unplan (Remove from sprint)
      if (sourceSprintId) {
        removeFromSprint.mutate({ issueId: activeId, sprintId: sourceSprintId });
        return;
      }

      // If coming from Backlog -> Reorder
      if (activeId !== overId && overId !== 'backlog-container-droppable' && overId !== 'backlog-list') {
        const oldIndex = backlogIssues?.findIndex(i => i.id === activeId);
        const newIndex = backlogIssues?.findIndex(i => i.id === overId);

        if (oldIndex !== undefined && oldIndex !== -1 && newIndex !== undefined && newIndex !== -1) {
          const newOrder = arrayMove(backlogIssues!, oldIndex, newIndex);
          reorderBacklog.mutate(newOrder.map(i => i.id));
        }
      }
    }
  };

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: { opacity: '0.4' },
      },
    }),
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Page Header */}
      <div className="flex-none px-8 py-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div>
          <Typography variant="h2" className="text-gray-900 dark:text-white font-bold tracking-tight">Backlog</Typography>
          <p className="text-sm text-gray-500 mt-1">Manage sprints and prioritize your backlog.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={() => { }}>Insights</Button>
          <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
            <PlusIcon className="h-4 w-4 mr-2" /> Create Issue
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-hidden flex flex-col px-8 py-6 gap-8">

          {/* Sprints Section - Top Pane */}
          <div className="flex-none max-h-[40vh] flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 flex-none">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active & Planned Sprints</h3>
              <button className="text-xs text-primary-600 hover:underline font-medium">Create Sprint</button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-4 pb-2">
              {sprintsLoading && <div className="py-4"><Spinner /></div>}
              {!sprintsLoading && activeOrPlannedSprints.length === 0 && (
                <div className="p-6 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <Typography variant="body-sm" className="text-gray-500">No active sprints. Create one to get started.</Typography>
                </div>
              )}
              {activeOrPlannedSprints.map(sprint => (
                <SprintContainer key={sprint.id} sprint={sprint} projectId={projectId} />
              ))}
            </div>
          </div>

          {/* Backlog Section - Bottom Pane */}
          <div
            ref={setBacklogDroppableRef}
            className={`flex-1 flex flex-col min-h-0 border-t border-gray-100 dark:border-gray-800 pt-6 transition-colors ${isOverBacklogContainer ? 'bg-primary-50/10' : ''}`}
          >
            <div className="flex items-center justify-between mb-4 flex-none">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Backlog</h3>
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-0.5 rounded-full text-xs font-bold">{backlogIssues?.length || 0}</span>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Search backlog..." className="h-8 text-sm w-48" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {/* Explicit Drop Zone for Unplanning - Render only when dragging FROM a sprint */}
              {isDraggingFromSprint && <BacklogDropZone />}

              {backlogLoading ? <div className="py-8 flex justify-center"><Spinner /></div> : (
                <SortableContext items={backlogIssueIds} strategy={verticalListSortingStrategy}>
                  <div className="pb-20 space-y-2 min-h-[100px]" id="backlog-list">
                    {backlogIssues?.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                        <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
                          <ArchiveBoxIcon className="h-6 w-6" />
                        </div>
                        <p>Your backlog is empty.</p>
                      </div>
                    )}
                    {backlogIssues?.map(issue => (
                      <IssueRow key={issue.id} issue={issue} />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeIssue ? <IssueRow issue={activeIssue} isOverlay /> : null}
        </DragOverlay>

      </DndContext>

      {isCreateModalOpen && <CreateIssueModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} projectId={projectId} />}
    </div>
  );
}

function ArchiveBoxIcon({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.75 7.5h16.5M3.75 7.5V5.625a2.25 2.25 0 012.25-2.25h12a2.25 2.25 0 012.25 2.25V7.5" />
  </svg>
}