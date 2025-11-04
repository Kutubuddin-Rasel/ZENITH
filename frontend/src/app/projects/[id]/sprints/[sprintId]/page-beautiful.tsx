"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Spinner from "../../../../../components/Spinner";
import { useSprints } from "../../../../../hooks/useSprints";
import { useSprintIssues, useReorderSprintIssues } from "../../../../../hooks/useSprintIssues";
import { useBacklog } from "../../../../../hooks/useBacklog";
import { useMoveIssueToSprint } from "../../../../../hooks/useMoveIssueToSprint";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
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
  SparklesIcon
} from '@heroicons/react/24/outline';

export default function SprintDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const sprintId = params.sprintId as string;
  const { sprints, isLoading, isError } = useSprints(projectId);
  const sprint = sprints?.find((s) => s.id === sprintId);

  // All hooks for issues, backlog, attachments, etc.
  const { issues: sprintIssues, isLoading: loadingSprint, isError: errorSprint } = useSprintIssues(projectId, sprintId);
  const { issues: backlogIssues, isLoading: loadingBacklog, isError: errorBacklog } = useBacklog(projectId);
  const reorderIssues = useReorderSprintIssues(projectId, sprintId);
  const { assignIssueToSprint, removeIssueFromSprint } = useMoveIssueToSprint(projectId, sprintId);
  const [activeTab, setActiveTab] = React.useState<'issues' | 'attachments'>('issues');
  const [localSprintIssues, setLocalSprintIssues] = useState(sprintIssues || []);
  const [localBacklogIssues, setLocalBacklogIssues] = useState(backlogIssues || []);
  const [editingStoryPointsId, setEditingStoryPointsId] = useState<string | null>(null);
  const [storyPointsValue, setStoryPointsValue] = useState<number | ''>('');

  useEffect(() => { setLocalSprintIssues(sprintIssues || []); }, [sprintIssues]);
  useEffect(() => { setLocalBacklogIssues(backlogIssues || []); }, [backlogIssues]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.droppableId === 'sprint-issues' && destination.droppableId === 'sprint-issues') {
      const reordered = Array.from(localSprintIssues);
      const [removed] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, removed);
      setLocalSprintIssues(reordered);
      reorderIssues.mutate(reordered.map((i) => i.id));
    } else if (source.droppableId === 'backlog-issues' && destination.droppableId === 'sprint-issues') {
      const backlogCopy = Array.from(localBacklogIssues);
      const sprintCopy = Array.from(localSprintIssues);
      const [moved] = backlogCopy.splice(source.index, 1);
      sprintCopy.splice(destination.index, 0, moved);
      setLocalBacklogIssues(backlogCopy);
      setLocalSprintIssues(sprintCopy);
      assignIssueToSprint.mutate(moved.id);
    } else if (source.droppableId === 'sprint-issues' && destination.droppableId === 'backlog-issues') {
      const sprintCopy = Array.from(localSprintIssues);
      const backlogCopy = Array.from(localBacklogIssues);
      const [moved] = sprintCopy.splice(source.index, 1);
      backlogCopy.splice(destination.index, 0, moved);
      setLocalSprintIssues(sprintCopy);
      setLocalBacklogIssues(backlogCopy);
      removeIssueFromSprint.mutate(moved.id);
    }
  };

  // Progress bar: % of issues with status 'Done'
  const total = localSprintIssues.length;
  const done = localSprintIssues.filter(i => i.status === 'Done').length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  // Attachments logic
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
  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
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
    const ext = a.filename.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      return <Image src={a.filepath} alt={a.filename} className="w-12 h-12 object-cover rounded-lg shadow-md" width={48} height={48} />;
    }
    return <span className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg text-2xl shadow-md">📎</span>;
  }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="text-center">
        <Spinner className="h-12 w-12 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Loading sprint details...</p>
      </div>
    </div>
  );
  
  if (isError || !sprint) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-red-900/20 dark:via-gray-800 dark:to-red-900/20">
      <div className="text-center">
        <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-700 dark:text-red-300 mb-2">Sprint Not Found</h2>
        <p className="text-red-600 dark:text-red-400">The sprint you&apos;re looking for doesn&apos;t exist or has been removed.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-green-400 via-blue-400 to-purple-500 opacity-90" />
        <div className="absolute inset-0 bg-white/10 dark:bg-gray-900/20 backdrop-blur-2xl" />
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
            
            {/* Enhanced Progress Bar */}
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
                {done} of {total} issues completed
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Tab Navigation */}
        <div className="flex justify-center mb-12">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-2 shadow-xl border border-white/20 dark:border-gray-700/50">
            <div className="flex gap-2">
              <button
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'issues' 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                }`}
                onClick={() => setActiveTab('issues')}
              >
                <FireIcon className="h-5 w-5" />
                Issues
              </button>
              <button
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
                  activeTab === 'attachments' 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                }`}
                onClick={() => setActiveTab('attachments')}
              >
                <PaperClipIcon className="h-5 w-5" />
                Attachments
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'issues' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Sprint Issues */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-blue-500 p-6 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <RocketLaunchIcon className="h-6 w-6" />
                    Sprint Issues
                  </h3>
                  <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
                    {localSprintIssues.length} issues
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
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="sprint-issues">
                      {(provided) => (
                        <ul 
                          ref={provided.innerRef} 
                          {...provided.droppableProps} 
                          className="space-y-3 min-h-[200px]"
                        >
                          {localSprintIssues.length === 0 && (
                            <li className="text-center py-12 text-gray-500 dark:text-gray-400">
                              <ClockIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>No issues in this sprint.</p>
                              <p className="text-sm">Drag issues from the backlog to get started!</p>
                            </li>
                          )}
                          {localSprintIssues.map((issue: Issue, idx: number) => (
                            <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                              {(provided, snapshot) => (
                                <li
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`bg-white dark:bg-gray-700 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-600 p-4 transition-all duration-300 group hover:shadow-xl ${
                                    snapshot.isDragging ? 'shadow-2xl scale-105 rotate-2 z-50' : ''
                                  }`}
                                >
                                  <div className="flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        {issue.title}
                                      </div>
                                      <div className="flex gap-2 items-center flex-wrap">
                                        {issue.priority && (
                                          <span className="flex items-center gap-1">
                                            <span
                                              className={`w-2 h-2 rounded-full ${
                                                issue.priority === 'Highest' ? 'bg-red-500' :
                                                issue.priority === 'High' ? 'bg-red-400' :
                                                issue.priority === 'Medium' ? 'bg-yellow-400' :
                                                issue.priority === 'Low' ? 'bg-green-400' :
                                                issue.priority === 'Lowest' ? 'bg-gray-400' :
                                                'bg-gray-300'
                                              }`}
                                            />
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                              issue.priority === 'Highest' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                              issue.priority === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                              issue.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                              issue.priority === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                              issue.priority === 'Lowest' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                            }`}>
                                              {issue.priority}
                                            </span>
                                          </span>
                                        )}
                                        {issue.storyPoints !== undefined ? (
                                          editingStoryPointsId === issue.id ? (
                                            <input
                                              type="number"
                                              min={0}
                                              className="px-2 py-1 rounded bg-green-100 text-green-700 font-semibold w-16 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
                                              value={storyPointsValue}
                                              autoFocus
                                              onChange={e => setStoryPointsValue(Number(e.target.value))}
                                              onBlur={() => setEditingStoryPointsId(null)}
                                              onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                  setEditingStoryPointsId(null);
                                                }
                                              }}
                                            />
                                          ) : (
                                            <span
                                              className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold text-xs cursor-pointer hover:bg-green-200 transition-colors"
                                              onClick={() => {
                                                setEditingStoryPointsId(issue.id);
                                                setStoryPointsValue(issue.storyPoints ?? '');
                                              }}
                                            >
                                              {issue.storyPoints} pts
                                            </span>
                                          )
                                        ) : null}
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
                                            <Image src={issue.assignee.avatarUrl} alt={issue.assignee.name || ''} className="w-8 h-8 object-cover" width={32} height={32} />
                                          ) : (
                                            <span className="text-blue-600 dark:text-blue-400">{
                                              typeof issue.assignee === 'object'
                                                ? (issue.assignee.name ? issue.assignee.name[0] : '')
                                                : (typeof issue.assignee === 'string' && (issue.assignee as string).length > 0
                                                    ? ((issue.assignee as string) || '')[0].toUpperCase()
                                                    : '')
                                            }</span>
                                          )}
                                        </div>
                                      )}
                                      <button
                                        className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
                                        onClick={() => {
                                          if (confirm('Remove this issue from the sprint?')) {
                                            removeIssueFromSprint.mutate(issue.id);
                                          }
                                        }}
                                      >
                                        <TrashIcon className="h-4 w-4 text-red-500" />
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </ul>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </div>
            </div>

            {/* Backlog */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <SparklesIcon className="h-6 w-6" />
                    Backlog
                  </h3>
                  <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
                    {localBacklogIssues.length} issues
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
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="backlog-issues">
                      {(provided) => (
                        <ul 
                          ref={provided.innerRef} 
                          {...provided.droppableProps} 
                          className="space-y-3 min-h-[200px]"
                        >
                          {localBacklogIssues.length === 0 && (
                            <li className="text-center py-12 text-gray-500 dark:text-gray-400">
                              <SparklesIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>No issues in backlog.</p>
                              <p className="text-sm">Create new issues to see them here!</p>
                            </li>
                          )}
                          {localBacklogIssues.map((issue: Issue, idx: number) => (
                            <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                              {(provided, snapshot) => (
                                <li
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`bg-white dark:bg-gray-700 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-600 p-4 transition-all duration-300 group hover:shadow-xl ${
                                    snapshot.isDragging ? 'shadow-2xl scale-105 rotate-2 z-50' : ''
                                  }`}
                                >
                                  <div className="flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                        {issue.title}
                                      </div>
                                      <div className="flex gap-2 items-center flex-wrap">
                                        {issue.priority && (
                                          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs dark:bg-blue-900/30 dark:text-blue-300">
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
                                    {issue.assignee && (
                                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center text-xs font-bold shadow-md">
                                        <span className="text-purple-600 dark:text-purple-400">
                                          {typeof issue.assignee === 'string' ? ((issue.assignee as string) || '')[0].toUpperCase() : 'A'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </ul>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'attachments' && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden">
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
                className={`border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-all duration-300 cursor-pointer group ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
                <ArrowUpTrayIcon className="h-12 w-12 text-gray-400 group-hover:text-blue-500 mx-auto mb-4 transition-colors" />
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {isUploading ? 'Uploading...' : 'Click or drag a file to upload'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
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
                        className={`bg-white dark:bg-gray-700 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-600 p-4 transition-all duration-300 hover:shadow-xl ${
                          recentlyUploadedId === a.id ? 'ring-2 ring-blue-500/60 bg-blue-50 dark:bg-blue-900/20 animate-pulse' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {renderFileIconOrThumb(a)}
                          <div className="flex-1 min-w-0">
                            <a 
                              href={a.filepath} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 dark:text-blue-400 font-medium hover:underline truncate block"
                            >
                              {a.filename}
                            </a>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <div className="flex items-center gap-1 mb-1">
                                <UserIcon className="h-3 w-3" />
                                {a.uploader.name || a.uploader.email}
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
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
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
      </div>
    </div>
  );
} 