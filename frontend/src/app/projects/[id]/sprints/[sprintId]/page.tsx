"use client";
import React, { useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Spinner from "../../../../../components/Spinner";
import { useSprints } from "../../../../../hooks/useSprints";
import { useSprintIssues, useReorderSprintIssues } from "../../../../../hooks/useSprintIssues";
import { useBacklog } from "../../../../../hooks/useBacklog";
import { useMoveIssueToSprint } from "../../../../../hooks/useMoveIssueToSprint";
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
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Issue } from "../../../../../hooks/useProjectIssues";
import { useSprintAttachments, SprintAttachment } from "../../../../../hooks/useSprints";
import {
  TrashIcon,
  RocketLaunchIcon,
  CalendarIcon,
  FlagIcon,
  PaperClipIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  ExclamationTriangleIcon,
  FireIcon,
  SparklesIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import BurndownChart from "../../../../../components/analytics/BurndownChart";
import VelocityChart from "../../../../../components/analytics/VelocityChart";
import { useBurndown, useVelocity } from "../../../../../hooks/useSprintAnalytics";

// Sortable Issue Card Component
function SortableIssueCard({ issue, containerId, onRemove }: {
  issue: Issue;
  containerId: string;
  onRemove?: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${containerId}-${issue.id}`,
    data: { issue, containerId }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isSprint = containerId === 'sprint';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white dark:bg-neutral-700 rounded-2xl border border-neutral-100 dark:border-neutral-600 p-4 transition-all duration-200 group hover:shadow-xl cursor-grab active:cursor-grabbing ${isDragging ? 'shadow-2xl scale-105 border-blue-400' : ''
        }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-neutral-900 dark:text-white mb-2 group-hover:${isSprint ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'} transition-colors`}>
            {issue.title}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {issue.priority && (
              <span className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${issue.priority === 'Highest' ? 'bg-red-500' :
                    issue.priority === 'High' ? 'bg-red-400' :
                      issue.priority === 'Medium' ? 'bg-yellow-400' :
                        issue.priority === 'Low' ? 'bg-green-400' :
                          issue.priority === 'Lowest' ? 'bg-neutral-400' :
                            'bg-neutral-300'
                    }`}
                />
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${issue.priority === 'Highest' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                  issue.priority === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                    issue.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      issue.priority === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                        issue.priority === 'Lowest' ? 'bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-300' :
                          'bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-300'
                  }`}>
                  {issue.priority}
                </span>
              </span>
            )}
            {issue.storyPoints !== undefined && (
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs">
                {issue.storyPoints} pts
              </span>
            )}
            {issue.status === 'Done' && (
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs flex items-center gap-1">
                <CheckCircleIcon className="h-3 w-3" />
                Done
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {issue.assignee && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center text-xs font-bold overflow-hidden shadow-md">
              {typeof issue.assignee === 'object' && issue.assignee.avatarUrl ? (
                <Image src={issue.assignee.avatarUrl} alt={issue.assignee.name || ''} className="w-8 h-8 object-cover" width={32} height={32} unoptimized />
              ) : (
                <span className="text-blue-600 dark:text-blue-400">{
                  typeof issue.assignee === 'object'
                    ? (issue.assignee.name ? issue.assignee.name[0] : '')
                    : typeof issue.assignee === 'string'
                      ? ((issue.assignee as string) || '')[0].toUpperCase()
                      : ''
                }</span>
              )}
            </div>
          )}
          {onRemove && (
            <button
              className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(issue.id);
              }}
            >
              <TrashIcon className="h-4 w-4 text-red-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Drag Overlay Card
function DragOverlayCard({ issue, isSprint }: { issue: Issue; isSprint: boolean }) {
  return (
    <div className={`bg-white dark:bg-neutral-700 rounded-2xl border-2 ${isSprint ? 'border-blue-400' : 'border-purple-400'} p-4 shadow-2xl scale-105 w-full max-w-md`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${isSprint ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'} mb-2`}>
            {issue.title}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {issue.priority && (
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${issue.priority === 'Highest' ? 'bg-red-100 text-red-800' :
                issue.priority === 'High' ? 'bg-orange-100 text-orange-800' :
                  'bg-neutral-100 text-neutral-800'
                }`}>
                {issue.priority}
              </span>
            )}
            {issue.storyPoints !== undefined && (
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs">
                {issue.storyPoints} pts
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Droppable Container
function DroppableContainer({ id, children, isEmpty, label }: {
  id: string;
  children: React.ReactNode;
  isEmpty: boolean;
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`space-y-3 min-h-[200px] transition-all duration-200 ${isOver ? 'bg-blue-50/50 dark:bg-blue-900/10 rounded-xl p-2' : ''
        }`}
    >
      {isEmpty && (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          <ClockIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No issues in {label}.</p>
          <p className="text-sm">Drag issues from the other panel to add them!</p>
        </div>
      )}
      {children}
    </div>
  );
}

export default function SprintDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const sprintId = params.sprintId as string;
  const { sprints, isLoading, isError } = useSprints(projectId);
  const sprint = sprints?.find((s) => s.id === sprintId);

  const { issues: sprintIssues, isLoading: loadingSprint, isError: errorSprint } = useSprintIssues(projectId, sprintId);
  const { issues: backlogIssues, isLoading: loadingBacklog, isError: errorBacklog } = useBacklog(projectId);
  const reorderIssues = useReorderSprintIssues(projectId, sprintId);
  const { assignIssueToSprint, removeIssueFromSprint } = useMoveIssueToSprint(projectId, sprintId);
  const [activeTab, setActiveTab] = React.useState<'issues' | 'attachments' | 'analytics'>('issues');
  const [activeIssue, setActiveIssue] = useState<{ issue: Issue; containerId: string } | null>(null);

  const queryClient = useQueryClient();

  // Analytics Data
  const { data: burndownData, isLoading: loadingBurndown } = useBurndown(projectId, sprintId);
  const { data: velocityData, isLoading: loadingVelocity } = useVelocity(projectId);

  // Smooth sensors with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Progress calculation (Story Points)
  const totalPoints = sprintIssues?.reduce((acc, i) => acc + (i.storyPoints || 0), 0) || 0;
  const donePoints = sprintIssues?.filter(i => i.status === 'Done').reduce((acc, i) => acc + (i.storyPoints || 0), 0) || 0;
  // Fallback to issue count if no points
  const total = sprintIssues?.length || 0;
  const done = sprintIssues?.filter(i => i.status === 'Done').length || 0;

  const percent = totalPoints > 0
    ? Math.round((donePoints / totalPoints) * 100)
    : total > 0 ? Math.round((done / total) * 100) : 0;

  // Attachments
  const {
    attachments,
    isLoading: loadingAttachments,
    isError: errorAttachments,
    error: attachmentsError,
    uploadAttachment,
    isUploading,
    uploadError,
    deleteAttachment,
    isDeleting,
    deleteError,
  } = useSprintAttachments(projectId, sprintId);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [recentlyUploadedId, setRecentlyUploadedId] = React.useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const uploaded = await uploadAttachment(file);
      setRecentlyUploadedId(uploaded.id);
      setTimeout(() => setRecentlyUploadedId(null), 1200);
    }
  }

  async function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const uploaded = await uploadAttachment(file);
      setRecentlyUploadedId(uploaded.id);
      setTimeout(() => setRecentlyUploadedId(null), 1200);
    }
  }

  async function handleDeleteAttachment(a: SprintAttachment) {
    await deleteAttachment(a.id);
  }

  function renderFileIconOrThumb(a: SprintAttachment) {
    const ext = a.filename?.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      if (!a.filepath) {
        return <span className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg text-2xl shadow-md">📎</span>;
      }
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const imageUrl = a.filepath.startsWith('http') ? a.filepath : `${baseUrl}${a.filepath.startsWith('/') ? '' : '/'}${a.filepath}`;
        return <Image src={imageUrl} alt={a.filename || 'Image'} className="w-12 h-12 object-cover rounded-lg shadow-md" width={48} height={48} unoptimized />;
      } catch {
        return <span className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg text-2xl shadow-md">📎</span>;
      }
    }
    return <span className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg text-2xl shadow-md">📎</span>;
  }

  // DnD Handlers
  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const data = active.data.current as { issue: Issue; containerId: string } | undefined;
    if (data) {
      setActiveIssue(data);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveIssue(null);

    if (!over) return;

    const activeData = active.data.current as { issue: Issue; containerId: string } | undefined;
    const overId = over.id as string;

    if (!activeData) return;

    const sourceContainer = activeData.containerId;
    const issueId = activeData.issue.id;

    // Determine target container
    let targetContainer = sourceContainer;
    if (overId === 'sprint' || overId === 'backlog') {
      targetContainer = overId;
    } else if (overId.startsWith('sprint-')) {
      targetContainer = 'sprint';
    } else if (overId.startsWith('backlog-')) {
      targetContainer = 'backlog';
    }

    // Moving between containers
    if (sourceContainer !== targetContainer) {
      if (sourceContainer === 'backlog' && targetContainer === 'sprint') {
        assignIssueToSprint.mutate(issueId);
      } else if (sourceContainer === 'sprint' && targetContainer === 'backlog') {
        removeIssueFromSprint.mutate(issueId);
      }
      return;
    }

    // Reordering within sprint
    if (sourceContainer === 'sprint' && targetContainer === 'sprint' && sprintIssues) {
      const oldIndex = sprintIssues.findIndex(i => `sprint-${i.id}` === active.id);
      const newIndex = sprintIssues.findIndex(i => `sprint-${i.id}` === over.id);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(sprintIssues, oldIndex, newIndex);
        queryClient.setQueryData(['sprint-issues', projectId, sprintId], reordered);
        reorderIssues.mutate(reordered.map(i => i.id));
      }
    }
  }

  function handleRemoveFromSprint(issueId: string) {
    if (confirm('Remove this issue from the sprint?')) {
      removeIssueFromSprint.mutate(issueId);
    }
  }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900">
      <div className="text-center">
        <Spinner className="h-12 w-12 mx-auto mb-4" />
        <p className="text-neutral-600 dark:text-neutral-400">Loading sprint details...</p>
      </div>
    </div>
  );

  if (isError || !sprint) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-red-900/20 dark:via-neutral-800 dark:to-red-900/20">
      <div className="text-center">
        <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-700 dark:text-red-300 mb-2">Sprint Not Found</h2>
        <p className="text-red-600 dark:text-red-400">The sprint you&apos;re looking for doesn&apos;t exist or has been removed.</p>
      </div>
    </div>
  );

  const sprintIssueIds = (sprintIssues ?? []).map(i => `sprint-${i.id}`);
  const backlogIssueIds = (backlogIssues ?? []).map(i => `backlog-${i.id}`);

  return (
    <div className="min-h-screen relative">
      {/* Gradient Background */}
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-blue-200 via-purple-100 to-pink-200 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 animate-gradient-x" style={{ filter: 'blur(32px)', opacity: 0.7 }} />
      </div>

      <div className="relative z-10">
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-400 via-blue-400 to-purple-500 opacity-90" />
          <div className="absolute inset-0 bg-white/10 dark:bg-neutral-900/20 backdrop-blur-2xl" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl">
                  <RocketLaunchIcon className="h-10 w-10 text-white drop-shadow-lg" />
                </div>
                <div className="text-left">
                  <span className="inline-block px-4 py-2 text-sm font-bold rounded-full bg-white/20 backdrop-blur-xl text-white shadow-lg animate-pulse">
                    {sprint.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <h1 className="text-5xl md:text-6xl font-black text-white drop-shadow-2xl mb-4 tracking-tight">
                {sprint.name}
              </h1>
              {sprint.goal && (
                <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8 flex items-center justify-center gap-2">
                  <FlagIcon className="h-6 w-6 text-blue-200" />
                  {sprint.goal}
                </p>
              )}
              <div className="flex items-center justify-center gap-8 text-white/80 mb-8">
                {sprint.startDate && sprint.endDate ? (
                  <span className="flex items-center gap-2 text-lg">
                    <CalendarIcon className="h-5 w-5" />
                    {new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-lg">No dates set</span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-lg font-semibold text-white/90">Sprint Progress</span>
                  <span className="text-2xl font-bold text-white">{percent}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-6 overflow-hidden shadow-inner relative">
                  <div
                    className="bg-gradient-to-r from-green-400 via-blue-400 to-purple-500 h-6 rounded-full transition-all duration-1000 ease-out shadow-lg"
                    style={{ width: `${percent}%` }}
                  />
                  {percent === 100 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-bounce">
                      <span className="text-4xl">🏆</span>
                    </div>
                  )}
                </div>
                <div className="text-white/80 mt-2">
                  {totalPoints > 0 ? `${donePoints} of ${totalPoints} points completed` : `${done} of ${total} issues completed`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-12">
            <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-xl rounded-2xl p-2 shadow-xl border border-white/20 dark:border-neutral-700/50">
              <div className="flex gap-2">
                <button
                  className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${activeTab === 'issues'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-neutral-700/50'
                    }`}
                  onClick={() => setActiveTab('issues')}
                >
                  <FireIcon className="h-5 w-5" />
                  Issues
                </button>
                <button
                  className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${activeTab === 'attachments'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-neutral-700/50'
                    }`}
                  onClick={() => setActiveTab('attachments')}
                >
                  <PaperClipIcon className="h-5 w-5" />
                  Attachments
                </button>
                <button
                  className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${activeTab === 'analytics'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-neutral-700/50'
                    }`}
                  onClick={() => setActiveTab('analytics')}
                >
                  <ChartBarIcon className="h-5 w-5" />
                  Analytics
                </button>
              </div>
            </div>
          </div>

          {/* Issues Tab with DnD */}
          {activeTab === 'issues' && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Sprint Issues Panel */}
                <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-neutral-700/50">
                  <div className="bg-gradient-to-r from-green-500 to-blue-500 p-6 rounded-t-3xl text-white">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <RocketLaunchIcon className="h-6 w-6" />
                        Sprint Issues
                      </h3>
                      <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
                        {sprintIssues?.length ?? 0} issues
                      </span>
                    </div>
                    <p className="text-white/80 text-sm mt-1">Drag to reorder or remove issues</p>
                  </div>

                  <div className="p-6">
                    {loadingSprint ? (
                      <div className="flex justify-center py-12">
                        <Spinner className="h-8 w-8" />
                      </div>
                    ) : errorSprint ? (
                      <div className="text-center py-12">
                        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <p className="text-red-600 dark:text-red-400">Failed to load issues.</p>
                      </div>
                    ) : (
                      <SortableContext items={sprintIssueIds} strategy={verticalListSortingStrategy}>
                        <DroppableContainer id="sprint" isEmpty={(sprintIssues ?? []).length === 0} label="this sprint">
                          {(sprintIssues ?? []).map((issue) => (
                            <SortableIssueCard
                              key={`sprint-${issue.id}`}
                              issue={issue}
                              containerId="sprint"
                              onRemove={handleRemoveFromSprint}
                            />
                          ))}
                        </DroppableContainer>
                      </SortableContext>
                    )}
                  </div>
                </div>

                {/* Backlog Panel */}
                <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-neutral-700/50">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 rounded-t-3xl text-white">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <SparklesIcon className="h-6 w-6" />
                        Backlog
                      </h3>
                      <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
                        {backlogIssues?.length ?? 0} issues
                      </span>
                    </div>
                    <p className="text-white/80 text-sm mt-1">Drag issues to add them to the sprint</p>
                  </div>

                  <div className="p-6">
                    {loadingBacklog ? (
                      <div className="flex justify-center py-12">
                        <Spinner className="h-8 w-8" />
                      </div>
                    ) : errorBacklog ? (
                      <div className="text-center py-12">
                        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <p className="text-red-600 dark:text-red-400">Failed to load backlog.</p>
                      </div>
                    ) : (
                      <SortableContext items={backlogIssueIds} strategy={verticalListSortingStrategy}>
                        <DroppableContainer id="backlog" isEmpty={(backlogIssues ?? []).length === 0} label="backlog">
                          {(backlogIssues ?? []).map((issue) => (
                            <SortableIssueCard
                              key={`backlog-${issue.id}`}
                              issue={issue}
                              containerId="backlog"
                            />
                          ))}
                        </DroppableContainer>
                      </SortableContext>
                    )}
                  </div>
                </div>
              </div>

              {/* Drag Overlay */}
              <DragOverlay dropAnimation={{
                duration: 250,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
              }}>
                {activeIssue ? (
                  <DragOverlayCard issue={activeIssue.issue} isSprint={activeIssue.containerId === 'sprint'} />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {/* Attachments Tab */}
          {activeTab === 'attachments' && (
            <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-neutral-700/50 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-6 text-white">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <PaperClipIcon className="h-6 w-6" />
                  Attachments
                </h3>
                <p className="text-white/80 text-sm mt-1">Upload and manage files for this sprint</p>
              </div>

              <div className="p-6">
                {/* Upload Area */}
                <div
                  className={`border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-all duration-300 cursor-pointer group ${dragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-neutral-300 dark:border-neutral-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
                    }`}
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                  <ArrowUpTrayIcon className="h-12 w-12 text-neutral-400 group-hover:text-blue-500 mx-auto mb-4 transition-colors" />
                  <p className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                    {isUploading ? 'Uploading...' : 'Click or drag a file to upload'}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Support for images, documents, and other file types
                  </p>
                  {isUploading && <Spinner className="inline ml-2 h-4 w-4" />}
                  {uploadError && (
                    <div className="text-red-500 text-sm mt-2 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                      {String(uploadError)}
                    </div>
                  )}
                </div>

                {/* Attachments List */}
                <div className="space-y-4">
                  {loadingAttachments ? (
                    <div className="flex justify-center py-12">
                      <Spinner className="h-8 w-8" />
                    </div>
                  ) : errorAttachments ? (
                    <div className="text-center py-12">
                      <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
                      <p className="text-red-600 dark:text-red-400">
                        {attachmentsError?.message || 'Failed to load attachments.'}
                      </p>
                    </div>
                  ) : attachments && attachments.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {attachments.map((a) => (
                        <div
                          key={a.id}
                          className={`bg-white dark:bg-neutral-700 rounded-2xl shadow-lg border border-neutral-100 dark:border-neutral-600 p-4 transition-all duration-300 hover:shadow-xl ${recentlyUploadedId === a.id ? 'ring-2 ring-blue-500/60 bg-blue-50 dark:bg-blue-900/20 animate-pulse' : ''
                            }`}
                        >
                          <div className="flex items-start gap-3">
                            {renderFileIconOrThumb(a)}
                            <div className="flex-1 min-w-0">
                              <a
                                href={(() => {
                                  if (!a.filepath) return '#';
                                  try {
                                    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
                                    return a.filepath.startsWith('http') ? a.filepath : `${baseUrl}${a.filepath.startsWith('/') ? '' : '/'}${a.filepath}`;
                                  } catch {
                                    return '#';
                                  }
                                })()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 font-medium hover:underline truncate block"
                                onClick={(e) => !a.filepath && e.preventDefault()}
                              >
                                {a.filename || 'Unknown file'}
                              </a>
                              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                <div className="flex items-center gap-1 mb-1">
                                  <UserIcon className="h-3 w-3" />
                                  {a.uploader?.name || a.uploader?.email || 'Unknown user'}
                                </div>
                                <div className="flex items-center gap-1">
                                  <ClockIcon className="h-3 w-3" />
                                  {new Date(a.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <button
                              className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
                              onClick={() => handleDeleteAttachment(a)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? (
                                <Spinner className="h-4 w-4" />
                              ) : (
                                <XMarkIcon className="h-4 w-4 text-red-500" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                      <PaperClipIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No attachments yet.</p>
                      <p className="text-sm">Upload files to share with your team!</p>
                    </div>
                  )}
                  {deleteError && (
                    <div className="text-red-500 text-sm mt-4 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                      {String(deleteError)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-8">
              {loadingBurndown ? (
                <div className="flex justify-center py-12">
                  <Spinner className="h-12 w-12" />
                </div>
              ) : burndownData ? (
                <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-neutral-700/50 p-6">
                  <BurndownChart
                    sprint={burndownData.sprint}
                    snapshots={burndownData.snapshots}
                    idealBurnRate={burndownData.idealBurnRate}
                    initialScope={burndownData.initialScope}
                  />
                </div>
              ) : (
                <div className="text-center py-12">
                  <p>No analytics data available.</p>
                </div>
              )}

              {/* Project Velocity Section */}
              <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-neutral-700/50 p-6">
                {loadingVelocity ? (
                  <div className="flex justify-center py-12">
                    <Spinner className="h-12 w-12" />
                  </div>
                ) : velocityData && velocityData.length > 0 ? (
                  <VelocityChart data={velocityData} />
                ) : (
                  <div className="text-center py-12">
                    <p>No velocity data available (requires completed sprints).</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}