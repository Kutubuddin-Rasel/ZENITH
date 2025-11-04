import React, { useState } from 'react';
import Image from 'next/image';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import Typography from './Typography';
import { Sprint, useArchiveSprint } from '../hooks/useSprints';
import { useSprintIssues, useReorderSprintIssues } from '../hooks/useSprintIssues';
import { useBacklog } from '../hooks/useBacklog';
import { useMoveIssueToSprint } from '../hooks/useMoveIssueToSprint';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Issue } from '../hooks/useProjectIssues';
import { useSprintAttachments, SprintAttachment } from '../hooks/useSprints';
import { TrashIcon, Bars3Icon, TagIcon, BookmarkSquareIcon, CheckCircleIcon, BugAntIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useProject } from '@/hooks/useProject';

interface SprintDetailModalProps {
  open: boolean;
  onClose: () => void;
  sprint: Sprint;
  projectId: string;
}

const typeBadge: Record<Issue['type'], { icon: React.ReactElement; text: string; color: string }> = {
  Epic: { icon: <TagIcon className="h-3 w-3" />, text: 'Epic', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200' },
  Story: { icon: <BookmarkSquareIcon className="h-3 w-3" />, text: 'Story', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' },
  Task: { icon: <CheckCircleIcon className="h-3 w-3" />, text: 'Task', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' },
  Bug: { icon: <BugAntIcon className="h-3 w-3" />, text: 'Bug', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' },
  'Sub-task': { icon: <PlusIcon className="h-3 w-3" />, text: 'Sub-task', color: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200' },
};

const SprintDetailModal = ({ open, onClose, sprint, projectId }: SprintDetailModalProps) => {
  const { issues: sprintIssues, isLoading: loadingSprint, isError: errorSprint } = useSprintIssues(projectId, sprint.id);
  const { issues: backlogIssues, isLoading: loadingBacklog, isError: errorBacklog } = useBacklog(projectId);
  const reorderIssues = useReorderSprintIssues(projectId, sprint.id);
  const archiveSprint = useArchiveSprint(projectId, sprint.id);
  const { assignIssueToSprint, removeIssueFromSprint } = useMoveIssueToSprint(projectId, sprint.id);
  const [activeTab, setActiveTab] = React.useState<'issues' | 'attachments'>('issues');

  const [localSprintIssues, setLocalSprintIssues] = useState(sprintIssues || []);
  const [localBacklogIssues, setLocalBacklogIssues] = useState(backlogIssues || []);

  const { currentUserRole } = useProject(projectId);

  React.useEffect(() => {
    setLocalSprintIssues(sprintIssues || []);
  }, [sprintIssues]);
  React.useEffect(() => {
    setLocalBacklogIssues(backlogIssues || []);
  }, [backlogIssues]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;
    
    // Sprint <-> Sprint (reorder)
    if (source.droppableId === 'sprint-issues' && destination.droppableId === 'sprint-issues') {
      const reordered = Array.from(localSprintIssues);
      const [removed] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, removed);
      setLocalSprintIssues(reordered);
      reorderIssues.mutate(reordered.map((i) => i.id));
    }
    // Backlog -> Sprint
    else if (source.droppableId === 'backlog-issues' && destination.droppableId === 'sprint-issues') {
      const backlogCopy = Array.from(localBacklogIssues);
      const sprintCopy = Array.from(localSprintIssues);
      const [moved] = backlogCopy.splice(source.index, 1);
      sprintCopy.splice(destination.index, 0, moved);
      setLocalBacklogIssues(backlogCopy);
      setLocalSprintIssues(sprintCopy);
      assignIssueToSprint.mutate(moved.id);
    }
    // Sprint -> Backlog
    else if (source.droppableId === 'sprint-issues' && destination.droppableId === 'backlog-issues') {
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

  return (
    <Modal open={open} onClose={onClose} title={sprint.name} maxWidthClass="sm:max-w-6xl">
      {/* Sprint Header */}
      <div className="mb-6 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize
              ${sprint.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}
              ${sprint.status === 'PLANNED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : ''}
              ${sprint.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : ''}
            `}>
              {sprint.status.toLowerCase()}
            </span>
            {sprint.goal && (
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                {sprint.goal}
              </Typography>
            )}
          </div>
          {sprint.status === 'ACTIVE' && (currentUserRole === 'ProjectLead' || currentUserRole === 'Super-Admin') && (
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                if (confirm('Are you sure you want to close this sprint?')) {
                  await archiveSprint.mutateAsync(undefined);
                  onClose();
                }
              }}
            >
              Close Sprint
            </Button>
          )}
        </div>
        
        <div className="flex gap-6 text-sm text-neutral-600 dark:text-neutral-400 mb-3">
          {sprint.startDate && <span>📅 Start: {new Date(sprint.startDate).toLocaleDateString()}</span>}
          {sprint.endDate && <span>📅 End: {new Date(sprint.endDate).toLocaleDateString()}</span>}
        </div>
        
        <div className="mb-2">
          <div className="flex justify-between text-sm text-neutral-600 dark:text-neutral-400 mb-1">
            <span>Progress</span>
            <span>{done} of {total} issues done ({percent}%)</span>
          </div>
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div className="h-3 bg-green-500 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          className={`pb-2 px-4 font-medium ${activeTab === 'issues' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
          onClick={() => setActiveTab('issues')}
        >
          Issues
        </button>
        <button
          className={`pb-2 px-4 font-medium ${activeTab === 'attachments' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
          onClick={() => setActiveTab('attachments')}
        >
          Attachments
        </button>
      </div>
      
      {activeTab === 'issues' && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sprint Issues Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Typography variant="h3" className="text-neutral-900 dark:text-neutral-100">
                  Sprint Issues ({localSprintIssues.length})
                </Typography>
                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400">
                  Drag to reorder or move to backlog
                </Typography>
            </div>
              
            {loadingSprint ? (
                <div className="flex justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
            ) : errorSprint ? (
                <div className="p-6 text-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                  <Typography variant="body-sm" className="text-red-600 dark:text-red-400">
                    Failed to load sprint issues.
                  </Typography>
                </div>
              ) : (
                <Droppable droppableId="sprint-issues">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[400px] space-y-3 p-4 rounded-lg border-2 border-dashed transition-all duration-200 ${
                        snapshot.isDraggingOver 
                          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 shadow-lg' 
                          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800'
                      }`}
                    >
                      {localSprintIssues.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-neutral-500 dark:text-neutral-400">
                          <div className="w-16 h-16 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center mb-4">
                            <TagIcon className="h-8 w-8" />
                          </div>
                          <Typography variant="body" className="text-center font-medium mb-2">
                            No issues in this sprint
                          </Typography>
                          <Typography variant="body-sm" className="text-center">
                            Drag issues from backlog to add them
                          </Typography>
                        </div>
                      )}
                      
                      {localSprintIssues.map((issue: Issue, idx: number) => (
                        <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`group bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg transition-all duration-200 cursor-grab active:cursor-grabbing ${
                                snapshot.isDragging 
                                  ? 'shadow-2xl rotate-1 scale-105 z-50 border-blue-400' 
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
                                      <button
                                        className="ml-2 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                        aria-label="Remove from sprint"
                                        title="Remove from sprint"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm('Remove this issue from the sprint?')) {
                                            removeIssueFromSprint.mutate(issue.id);
                                          }
                                        }}
                                      >
                                        <TrashIcon className="h-4 w-4 text-red-500" />
                                      </button>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 items-center">
                                      {/* Issue Type */}
                                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeBadge[issue.type]?.color || 'bg-neutral-100 text-neutral-700'}`}>
                                        {typeBadge[issue.type]?.icon || <TagIcon className="h-3 w-3" />}
                                        {typeBadge[issue.type]?.text || issue.type}
                                      </span>
                                      
                                      {/* Priority */}
                                      {issue.priority && (
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                          issue.priority === 'Highest' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                                          issue.priority === 'High' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200' :
                                          issue.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' :
                                          issue.priority === 'Low' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                                          'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200'
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
                                  
                                  {/* Assignee */}
                              {issue.assignee && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600" title={typeof issue.assignee === 'object' ? issue.assignee.name : issue.assignee}>
                                  {typeof issue.assignee === 'object' && issue.assignee.avatarUrl ? (
                                    <Image src={issue.assignee.avatarUrl} alt={issue.assignee.name || ''} className="w-8 h-8 object-cover" width={32} height={32} />
                                  ) : (
                                    <span>{
                                      typeof issue.assignee === 'object'
                                        ? (issue.assignee.name ? issue.assignee.name[0] : '')
                                        : typeof issue.assignee === 'string' && issue.assignee
                                          ? (issue.assignee as string)[0]?.toUpperCase() || ''
                                          : ''
                                    }</span>
                                  )}
                                </div>
                              )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
            )}
          </div>
            
            {/* Backlog Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Typography variant="h3" className="text-neutral-900 dark:text-neutral-100">
                  Backlog ({localBacklogIssues.length})
                </Typography>
                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400">
                  Drag to add to sprint
                </Typography>
              </div>
              
            {loadingBacklog ? (
                <div className="flex justify-center py-12">
                  <Spinner className="h-8 w-8" />
                </div>
            ) : errorBacklog ? (
                <div className="p-6 text-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                  <Typography variant="body-sm" className="text-red-600 dark:text-red-400">
                    Failed to load backlog.
                  </Typography>
                </div>
              ) : (
                <Droppable droppableId="backlog-issues">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[400px] space-y-3 p-4 rounded-lg border-2 border-dashed transition-all duration-200 ${
                        snapshot.isDraggingOver 
                          ? 'border-green-400 bg-green-50 dark:bg-green-950/20 shadow-lg' 
                          : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800'
                      }`}
                    >
                      {localBacklogIssues.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-neutral-500 dark:text-neutral-400">
                          <div className="w-16 h-16 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center mb-4">
                            <TagIcon className="h-8 w-8" />
                          </div>
                          <Typography variant="body" className="text-center font-medium mb-2">
                            No issues in backlog
                          </Typography>
                          <Typography variant="body-sm" className="text-center">
                            Create issues to see them here
                          </Typography>
                        </div>
                      )}
                      
                      {localBacklogIssues.map((issue: Issue, idx: number) => (
                        <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`group bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg transition-all duration-200 cursor-grab active:cursor-grabbing ${
                                snapshot.isDragging 
                                  ? 'shadow-2xl rotate-1 scale-105 z-50 border-green-400' 
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
                                    <Typography variant="body" className="font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 mb-3">
                                      {issue.title}
                                    </Typography>
                                    
                                    <div className="flex flex-wrap gap-2 items-center">
                                      {/* Issue Type */}
                                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${typeBadge[issue.type]?.color || 'bg-neutral-100 text-neutral-700'}`}>
                                        {typeBadge[issue.type]?.icon || <TagIcon className="h-3 w-3" />}
                                        {typeBadge[issue.type]?.text || issue.type}
                                      </span>
                                      
                                      {/* Priority */}
                                      {issue.priority && (
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                          issue.priority === 'Highest' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' :
                                          issue.priority === 'High' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200' :
                                          issue.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' :
                                          issue.priority === 'Low' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' :
                                          'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200'
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
                                  
                                  {/* Assignee */}
                                  {issue.assignee && (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600" title={typeof issue.assignee === 'object' ? issue.assignee.name : issue.assignee}>
                                      {typeof issue.assignee === 'object' && issue.assignee.avatarUrl ? (
                                        <Image src={issue.assignee.avatarUrl} alt={issue.assignee.name || ''} className="w-8 h-8 object-cover" width={32} height={32} />
                                      ) : (
                                        <span>{
                                          typeof issue.assignee === 'object'
                                            ? (issue.assignee.name ? issue.assignee.name[0] : '')
                                            : typeof issue.assignee === 'string' && issue.assignee
                                              ? (issue.assignee as string)[0]?.toUpperCase() || ''
                                              : ''
                                        }</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                                </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
            )}
          </div>
        </div>
        </DragDropContext>
      )}
      
      {activeTab === 'attachments' && (
        <SprintAttachmentsTab projectId={projectId} sprintId={sprint.id} />
      )}
    </Modal>
  );
};

function SprintAttachmentsTab({ projectId, sprintId }: { projectId: string; sprintId: string }) {
  const {
    attachments,
    isLoading,
    isError,
    error,
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
    const ext = a.filename?.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      if (!a.filepath) {
        return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
      }
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const imageUrl = a.filepath.startsWith('http') 
          ? a.filepath 
          : `${baseUrl}${a.filepath.startsWith('/') ? '' : '/'}${a.filepath}`;
        
        return <Image src={imageUrl} alt={a.filename || 'Image'} className="w-10 h-10 object-cover rounded" width={40} height={40} />;
      } catch {
        return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
      }
    }
    return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
  }

  return (
    <div className="flex flex-col h-[400px]">
      <div
        className={`border-2 border-dashed rounded-md p-4 mb-4 text-center transition-colors ${dragActive ? 'border-accent-blue bg-accent-blue/5' : 'border-gray-300 dark:border-gray-700'}`}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{ cursor: 'pointer' }}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <span className="text-accent-blue font-semibold">Click or drag a file to upload</span>
        {isUploading && <Spinner className="inline ml-2 h-4 w-4" />}
        {uploadError && <div className="text-red-500 text-sm mt-1">{String(uploadError)}</div>}
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : isError ? (
          <div className="text-red-500 text-center py-8">{error?.message || 'Failed to load attachments.'}</div>
        ) : attachments && attachments.length > 0 ? (
          attachments.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 border rounded-md p-2 bg-white dark:bg-background-dark transition-all duration-300 ${recentlyUploadedId === a.id ? 'animate-fade-in-slide ring-2 ring-accent-blue/60 bg-accent-blue/5' : ''}`}
            >
              {renderFileIconOrThumb(a)}
              <div className="flex-1">
                <a 
                  href={(() => {
                    if (!a.filepath) return '#';
                    try {
                      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
                      return a.filepath.startsWith('http') 
                        ? a.filepath 
                        : `${baseUrl}${a.filepath.startsWith('/') ? '' : '/'}${a.filepath}`;
                    } catch {
                      return '#';
                    }
                  })()}
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-accent-blue font-medium hover:underline"
                  onClick={(e) => !a.filepath && e.preventDefault()}
                >
                  {a.filename || 'Unknown file'}
                </a>
                <div className="text-xs text-gray-500">
                  Uploaded by {a.uploader?.name || a.uploader?.email || 'Unknown user'} on {new Date(a.createdAt).toLocaleString()}
                </div>
              </div>
              <Button size="xs" variant="secondary" onClick={() => handleDeleteAttachment(a)} loading={isDeleting} disabled={isDeleting}>Delete</Button>
            </div>
          ))
        ) : (
          <div className="text-gray-400 text-center py-8">No attachments yet.</div>
        )}
        {deleteError && <div className="text-red-500 text-sm mt-1">{String(deleteError)}</div>}
      </div>
    </div>
  );
}

export default SprintDetailModal; 