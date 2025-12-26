"use client";
import React, { useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Spinner from "@/components/Spinner";
import Typography from "@/components/Typography";
import Button from "@/components/Button";
import Card from "@/components/Card";
import { useSprints } from "@/hooks/useSprints";
import { useSprintIssues, useReorderSprintIssues } from "@/hooks/useSprintIssues";
import { useBacklog } from "@/hooks/useBacklog";
import { useMoveIssueToSprint } from "@/hooks/useMoveIssueToSprint";
import { useSprintAttachments, SprintAttachment } from "@/hooks/useSprints";
import { useBurndown, useVelocity } from "@/hooks/useSprintAnalytics";
import BurndownChart from "@/components/analytics/BurndownChart";
import VelocityChart from "@/components/analytics/VelocityChart";
import { DraggableCard, DragOverlayCard, DragContext } from "@/components/DraggableCard";
import { DROP_ANIMATION, DRAG_ACTIVATION_CONSTRAINT } from "@/lib/drag-physics";
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
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Issue } from "@/hooks/useProjectIssues";
import { useQueryClient } from '@tanstack/react-query';
import {
  TrashIcon,
  BoltIcon,
  CalendarIcon,
  PaperClipIcon,
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  TrophyIcon,
  InboxStackIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// DROPPABLE CONTAINERS
// ============================================================================

interface DroppableListZoneProps {
  id: string;
  label: string;
  children: React.ReactNode;
  isEmpty: boolean;
  isOver: boolean;
}

function DroppableListZone({ id, label, children, isEmpty, isOver }: DroppableListZoneProps) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[300px] rounded-xl transition-all duration-200
        ${isOver ? 'bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-400' : ''}
        ${isEmpty && !isOver ? 'flex items-center justify-center p-8 border-2 border-dashed border-neutral-200 dark:border-neutral-700/50' : ''}
      `}
    >
      {isEmpty ? (
        <div className="text-center max-w-xs">
          <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
            {id === 'sprint' ? (
              <RocketLaunchIcon className="w-6 h-6 text-neutral-400" />
            ) : (
              <InboxStackIcon className="w-6 h-6 text-neutral-400" />
            )}
          </div>
          <Typography variant="body" className="font-medium text-neutral-900 dark:text-white">
            No issues in {label}
          </Typography>
          <Typography variant="body-sm" className="text-neutral-500 mt-1">
            Drag issues here to organize your work
          </Typography>
          {isOver && (
            <Typography variant="body-sm" className="text-blue-600 dark:text-blue-400 font-medium mt-2">
              Drop here
            </Typography>
          )}
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN SPRINT DETAILS PAGE
// ============================================================================

export default function SprintDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const sprintId = params.sprintId as string;
  const queryClient = useQueryClient();

  // Data fetching
  const { sprints, isLoading, isError } = useSprints(projectId);
  const sprint = sprints?.find((s) => s.id === sprintId);
  const { issues: sprintIssues, isLoading: loadingSprint } = useSprintIssues(projectId, sprintId);
  const { issues: backlogIssues, isLoading: loadingBacklog } = useBacklog(projectId);
  const reorderIssues = useReorderSprintIssues(projectId, sprintId);
  const { assignIssueToSprint, removeIssueFromSprint } = useMoveIssueToSprint(projectId, sprintId);

  // Analytics
  const { data: burndownData, isLoading: loadingBurndown } = useBurndown(projectId, sprintId);
  const { data: velocityData, isLoading: loadingVelocity } = useVelocity(projectId);

  // Attachments
  const {
    attachments,
    isLoading: loadingAttachments,
    isError: errorAttachments,
    uploadAttachment,
    isUploading,
    deleteAttachment,
    isDeleting,
  } = useSprintAttachments(projectId, sprintId);

  // UI State
  const [activeTab, setActiveTab] = useState<'issues' | 'attachments' | 'analytics'>('issues');
  const [activeItem, setActiveItem] = useState<{ issue: Issue; context: DragContext } | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [recentlyUploadedId, setRecentlyUploadedId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: DRAG_ACTIVATION_CONSTRAINT,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Progress calculation
  const progressData = useMemo(() => {
    const totalPoints = sprintIssues?.reduce((acc, i) => acc + (i.storyPoints || 0), 0) || 0;
    const donePoints = sprintIssues?.filter(i => i.status === 'Done').reduce((acc, i) => acc + (i.storyPoints || 0), 0) || 0;
    const total = sprintIssues?.length || 0;
    const done = sprintIssues?.filter(i => i.status === 'Done').length || 0;
    const percent = totalPoints > 0
      ? Math.round((donePoints / totalPoints) * 100)
      : total > 0 ? Math.round((done / total) * 100) : 0;
    return { totalPoints, donePoints, total, done, percent };
  }, [sprintIssues]);

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
      setOverContainerId(null);
      return;
    }

    const overId = String(over.id);
    const overData = over.data.current as { context?: DragContext } | undefined;

    if (overId === 'sprint' || overId === 'backlog') {
      setOverContainerId(overId);
    } else if (overData?.context?.type === 'sprint') {
      setOverContainerId('sprint');
    } else if (overData?.context?.type === 'backlog') {
      setOverContainerId('backlog');
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    setOverContainerId(null);

    if (!over) return;

    const activeData = active.data.current as { issue: Issue; context: DragContext } | undefined;
    if (!activeData) return;

    const overId = String(over.id);
    const issueId = activeData.issue.id;
    const sourceContext = activeData.context;
    const overData = over.data.current as { context?: DragContext } | undefined;

    // Determine target container
    let targetContainer: 'sprint' | 'backlog' = sourceContext.type === 'sprint' ? 'sprint' : 'backlog';
    if (overId === 'sprint') targetContainer = 'sprint';
    else if (overId === 'backlog') targetContainer = 'backlog';
    else if (overData?.context?.type === 'sprint') targetContainer = 'sprint';
    else if (overData?.context?.type === 'backlog') targetContainer = 'backlog';

    const sourceContainer = sourceContext.type === 'sprint' ? 'sprint' : 'backlog';

    // Cross-container moves
    if (sourceContainer !== targetContainer) {
      if (sourceContainer === 'backlog' && targetContainer === 'sprint') {
        // Optimistic update
        queryClient.setQueryData<Issue[]>(['backlog', projectId], prev =>
          prev ? prev.filter(i => i.id !== issueId) : []
        );
        assignIssueToSprint.mutate(issueId);
      } else if (sourceContainer === 'sprint' && targetContainer === 'backlog') {
        // Optimistic update
        queryClient.setQueryData<Issue[]>(['backlog', projectId], prev =>
          prev ? [...prev, activeData.issue] : [activeData.issue]
        );
        removeIssueFromSprint.mutate(issueId);
      }
      return;
    }

    // Reordering within sprint
    if (sourceContainer === 'sprint' && targetContainer === 'sprint' && sprintIssues) {
      const oldIndex = sprintIssues.findIndex(i => i.id === issueId);
      const newIndex = over.id === 'sprint'
        ? sprintIssues.length - 1
        : sprintIssues.findIndex(i => i.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(sprintIssues, oldIndex, newIndex);
        queryClient.setQueryData(['sprint-issues', projectId, sprintId], reordered);
        reorderIssues.mutate(reordered.map(i => i.id));
      }
    }
  }, [projectId, sprintId, queryClient, sprintIssues, assignIssueToSprint, removeIssueFromSprint, reorderIssues]);

  const handleRemoveFromSprint = useCallback((issueId: string) => {
    if (confirm('Remove this issue from the sprint?')) {
      removeIssueFromSprint.mutate(issueId);
    }
  }, [removeIssueFromSprint]);

  // =========================================================================
  // ATTACHMENT HANDLERS
  // =========================================================================

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const uploaded = await uploadAttachment(file);
      setRecentlyUploadedId(uploaded.id);
      setTimeout(() => setRecentlyUploadedId(null), 1200);
    }
  }, [uploadAttachment]);

  const handleFileDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const uploaded = await uploadAttachment(file);
      setRecentlyUploadedId(uploaded.id);
      setTimeout(() => setRecentlyUploadedId(null), 1200);
    }
  }, [uploadAttachment]);

  const renderFileIcon = useCallback((a: SprintAttachment) => {
    const ext = a.filename?.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      if (!a.filepath) {
        return <span className="w-12 h-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-lg shadow-sm"><PaperClipIcon className="h-6 w-6 text-blue-500" /></span>;
      }
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const imageUrl = a.filepath.startsWith('http') ? a.filepath : `${baseUrl}${a.filepath.startsWith('/') ? '' : '/'}${a.filepath}`;
        return <Image src={imageUrl} alt={a.filename || 'Image'} className="w-12 h-12 object-cover rounded-lg shadow-sm" width={48} height={48} unoptimized />;
      } catch {
        return <span className="w-12 h-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-lg shadow-sm"><PaperClipIcon className="h-6 w-6 text-blue-500" /></span>;
      }
    }
    return <span className="w-12 h-12 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-lg shadow-sm"><PaperClipIcon className="h-6 w-6 text-blue-500" /></span>;
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================

  if (isLoading || loadingSprint || loadingBacklog) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Loading sprint...
          </Typography>
        </div>
      </div>
    );
  }

  if (isError || !sprint) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <Card className="text-center p-8 max-w-md">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <Typography variant="h3" className="text-red-700 dark:text-red-300 mb-2">
            Sprint not found
          </Typography>
          <Typography variant="body" className="text-red-600 dark:text-red-400">
            The sprint you're looking for doesn't exist.
          </Typography>
        </Card>
      </div>
    );
  }

  const sprintContext: DragContext = { type: 'sprint', sprintId };
  const backlogContext: DragContext = { type: 'backlog' };
  const sprintList = sprintIssues || [];
  const backlogList = backlogIssues || [];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Sprint Header */}
      <header className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Typography variant="h2" className="text-neutral-900 dark:text-white font-bold">
                {sprint.name}
              </Typography>
              <span className={`
                px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider
                ${sprint.status === 'ACTIVE'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : sprint.status === 'COMPLETED'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'}
              `}>
                {sprint.status}
              </span>
            </div>
            {sprint.goal && (
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 italic">
                🎯 {sprint.goal}
              </Typography>
            )}
            <div className="flex items-center gap-6 text-sm text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {sprint.startDate && sprint.endDate
                  ? `${new Date(sprint.startDate).toLocaleDateString()} - ${new Date(sprint.endDate).toLocaleDateString()}`
                  : 'No dates set'}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="w-full max-w-sm">
            <div className="flex justify-between items-center mb-2">
              <Typography variant="body-sm" className="font-semibold text-neutral-700 dark:text-neutral-300">
                Sprint Progress
              </Typography>
              <Typography variant="h4" className="text-neutral-900 dark:text-white">
                {progressData.percent}%
              </Typography>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressData.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              <span>{progressData.done} done</span>
              <span>{progressData.total} total</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 border-b border-neutral-200 dark:border-neutral-700 -mb-px">
          {(['issues', 'attachments', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${activeTab === tab
                  ? 'bg-white dark:bg-neutral-800 text-primary-600 dark:text-primary-400 border border-b-0 border-neutral-200 dark:border-neutral-700'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}
              `}
            >
              {tab === 'issues' && <BoltIcon className="h-4 w-4 inline mr-1.5" />}
              {tab === 'attachments' && <PaperClipIcon className="h-4 w-4 inline mr-1.5" />}
              {tab === 'analytics' && <ChartBarIcon className="h-4 w-4 inline mr-1.5" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Tab Content */}
      <main className="p-6">
        {/* Issues Tab */}
        {activeTab === 'issues' && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sprint Issues */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Typography variant="h4" className="text-neutral-800 dark:text-white font-semibold">
                      Sprint Issues
                    </Typography>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                      {sprintList.length}
                    </span>
                  </div>
                  <span className="text-sm text-neutral-500">
                    {progressData.totalPoints} pts
                  </span>
                </div>

                <DroppableListZone
                  id="sprint"
                  label="Sprint"
                  isEmpty={sprintList.length === 0}
                  isOver={overContainerId === 'sprint'}
                >
                  <SortableContext items={sprintList.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {sprintList.map(issue => (
                      <DraggableCard
                        key={issue.id}
                        issue={issue}
                        context={sprintContext}
                        variant="list"
                        onRemove={() => handleRemoveFromSprint(issue.id)}
                      />
                    ))}
                  </SortableContext>
                </DroppableListZone>
              </Card>

              {/* Backlog */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <InboxStackIcon className="h-5 w-5 text-neutral-400" />
                    <Typography variant="h4" className="text-neutral-800 dark:text-white font-semibold">
                      Backlog
                    </Typography>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                      {backlogList.length}
                    </span>
                  </div>
                </div>

                <DroppableListZone
                  id="backlog"
                  label="Backlog"
                  isEmpty={backlogList.length === 0}
                  isOver={overContainerId === 'backlog'}
                >
                  <SortableContext items={backlogList.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {backlogList.map(issue => (
                      <DraggableCard
                        key={issue.id}
                        issue={issue}
                        context={backlogContext}
                        variant="list"
                      />
                    ))}
                  </SortableContext>
                </DroppableListZone>
              </Card>
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
        )}

        {/* Attachments Tab */}
        {activeTab === 'attachments' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <Typography variant="h3" className="text-neutral-900 dark:text-white">
                Attachments
              </Typography>
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Drop Zone */}
            <div
              className={`
                border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all
                ${dragActive
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/10'
                  : 'border-neutral-300 dark:border-neutral-600'}
              `}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleFileDrop}
            >
              <ArrowUpTrayIcon className="h-10 w-10 mx-auto text-neutral-400 mb-3" />
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                Drag and drop files here, or click upload
              </Typography>
            </div>

            {/* Attachments List */}
            {loadingAttachments ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-8 w-8" />
              </div>
            ) : errorAttachments ? (
              <div className="text-center py-8 text-red-500">
                Failed to load attachments
              </div>
            ) : !attachments?.length ? (
              <div className="text-center py-8 text-neutral-400">
                <PaperClipIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <Typography variant="body">No attachments yet</Typography>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className={`
                      flex items-center gap-3 p-4 rounded-lg border transition-all
                      ${recentlyUploadedId === a.id
                        ? 'border-green-300 bg-green-50 dark:bg-green-900/10'
                        : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'}
                    `}
                  >
                    {renderFileIcon(a)}
                    <div className="flex-1 min-w-0">
                      <Typography variant="body-sm" className="font-medium truncate">
                        {a.filename}
                      </Typography>
                      <Typography variant="body-sm" className="text-neutral-500 text-xs">
                        {(a as { fileSize?: number }).fileSize ? `${((a as { fileSize?: number }).fileSize! / 1024).toFixed(1)} KB` : ''}
                      </Typography>
                    </div>
                    <button
                      onClick={() => deleteAttachment(a.id)}
                      disabled={isDeleting}
                      className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <ChartBarIcon className="h-5 w-5 text-blue-500" />
                <Typography variant="h3" className="text-neutral-900 dark:text-white">
                  Burndown Chart
                </Typography>
              </div>
              {loadingBurndown ? (
                <div className="flex justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : burndownData ? (
                <BurndownChart {...burndownData} />
              ) : (
                <div className="text-center py-12 text-neutral-400">
                  No burndown data available
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrophyIcon className="h-5 w-5 text-amber-500" />
                <Typography variant="h3" className="text-neutral-900 dark:text-white">
                  Velocity Chart
                </Typography>
              </div>
              {loadingVelocity ? (
                <div className="flex justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : velocityData ? (
                <VelocityChart data={velocityData} />
              ) : (
                <div className="text-center py-12 text-neutral-400">
                  No velocity data available
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}