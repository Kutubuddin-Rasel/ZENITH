"use client";
import React, { useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useBoard } from "../../../../../hooks/useBoard";
import type { BoardColumn } from "../../../../../hooks/useBoard";
import { useBoardIssues } from "../../../../../hooks/useBoardIssues";
import { useUpdateIssueStatus } from "../../../../../hooks/useUpdateIssueStatus";
import { useReorderBoardIssues } from "../../../../../hooks/useReorderBoardIssues";
import Spinner from "../../../../../components/Spinner";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { Issue } from '../../../../../hooks/useProjectIssues';
import { connectSocket, getSocket } from '../../../../../lib/socket';
import { useToast } from '../../../../../context/ToastContext';
import { useAuth } from '../../../../../context/AuthContext';
import BoardManagementModal from "../../../../../components/BoardManagementModal";
import { useProject } from "../../../../../hooks/useProject";
import Button from "../../../../../components/Button";
import { 
  PlusIcon as PlusIconSolid,
  BookmarkSquareIcon,
  BugAntIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/solid';
import {
  EllipsisHorizontalIcon,
  UserIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import QuickCreateIssueForm from "../../../../../components/QuickCreateIssueForm";
import { CSS } from '@dnd-kit/utilities';
import Typography from "../../../../../components/Typography";
import Card from "../../../../../components/Card";

const typeBadge: Record<Issue['type'], { icon: React.ReactElement; text: string; color: string }> = {
  Epic: { icon: <TagIcon className="h-4 w-4 mr-1" />, text: 'Epic', color: 'bg-purple-100 text-purple-700' },
  Story: { icon: <BookmarkSquareIcon className="h-4 w-4 mr-1" />, text: 'Story', color: 'bg-green-100 text-green-700' },
  Task: { icon: <CheckCircleIcon className="h-4 w-4 mr-1" />, text: 'Task', color: 'bg-blue-100 text-blue-700' },
  Bug: { icon: <BugAntIcon className="h-4 w-4 mr-1" />, text: 'Bug', color: 'bg-red-100 text-red-700' },
  'Sub-task': { icon: <PlusIconSolid className="h-4 w-4 mr-1" />, text: 'Sub-task', color: 'bg-gray-100 text-gray-700' },
};

const priorityBadge: Record<Issue['priority'], { icon: React.ReactElement; text: string; color: string }> = {
  Highest: { icon: <ArrowUpIcon className="h-4 w-4 mr-1" />, text: 'Highest', color: 'bg-red-100 text-red-700' },
  High: { icon: <ArrowUpIcon className="h-4 w-4 mr-1" />, text: 'High', color: 'bg-orange-100 text-orange-700' },
  Medium: { icon: <span className="h-4 w-4 mr-1 flex items-center justify-center font-bold text-yellow-500">=</span>, text: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
  Low: { icon: <ArrowDownIcon className="h-4 w-4 mr-1" />, text: 'Low', color: 'bg-green-100 text-green-700' },
  Lowest: { icon: <ArrowDownIcon className="h-4 w-4 mr-1" />, text: 'Lowest', color: 'bg-gray-100 text-gray-700' },
};

function SortableIssueCard({ issue, children }: { issue: Issue; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

type BoardColumnProps = {
  col: BoardColumn;
  issuesByColumn: Record<string, Issue[]>;
  showCreateForm: string | null;
  setShowCreateForm: (id: string | null) => void;
  currentUserRole: string | undefined;
  projectId: string;
  refetch: () => void;
};

const BoardColumn: React.FC<BoardColumnProps> = ({
  col,
  issuesByColumn,
  showCreateForm,
  setShowCreateForm,
  currentUserRole,
  projectId,
  refetch,
}) => {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: col.id });
  const issueIds = (issuesByColumn[col.name] || []).filter(issue => !issue.parentId).map(issue => issue.id);
  return (
    <SortableContext id={col.id} items={issueIds}>
      <div
        ref={setDroppableRef}
        className={`relative flex-1 min-w-[280px] max-w-[340px] flex flex-col rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-all duration-200 ${isOver ? 'ring-2 ring-blue-500 ring-opacity-50 bg-blue-50 dark:bg-blue-950/20' : ''}`}
        style={{ marginBottom: 8, marginTop: 4 }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Typography variant="h3" className="text-neutral-900 dark:text-white font-semibold">
              {col.name}
              </Typography>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                {(issuesByColumn[col.name] || []).length}
              </span>
            </div>
          </div>
        </div>
        
        {/* Issues list */}
        <div className="flex-1 flex flex-col gap-2 p-3">
          {issueIds.length === 0 && !showCreateForm && (
            <div className={`flex flex-col items-center justify-center text-neutral-400 text-sm text-center py-8 ${isOver ? 'bg-blue-50 dark:bg-blue-950/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg' : ''}`} style={{ minHeight: 80 }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 32 32" aria-hidden="true" className="mb-2 text-neutral-300">
                <rect x="4" y="8" width="24" height="16" rx="4" fill="currentColor" opacity="0.2" />
                <rect x="8" y="14" width="16" height="2" rx="1" fill="currentColor" opacity="0.4" />
                <rect x="8" y="18" width="12" height="2" rx="1" fill="currentColor" opacity="0.3" />
              </svg>
              <span>No issues</span>
              {isOver && <span className="block mt-1 text-xs text-blue-600 dark:text-blue-400">Drop here</span>}
            </div>
          )}
          {issueIds.map(issueId => {
            const issue = (issuesByColumn[col.name] || []).find(i => i.id === issueId);
            if (!issue) return null;
            return (
              <SortableIssueCard key={issue.id} issue={issue}>
                <Card className="p-3 hover:shadow-md transition-shadow">
                  {/* Top row: type and priority badges */}
                  <div className="flex gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${typeBadge[issue.type]?.color || 'bg-neutral-100 text-neutral-600'}`}>
                      {typeBadge[issue.type]?.icon || <TagIcon className="h-4 w-4 mr-1" />} {typeBadge[issue.type]?.text || issue.type}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${priorityBadge[issue.priority]?.color || 'bg-neutral-100 text-neutral-600'}`}>
                      {priorityBadge[issue.priority]?.icon || <EllipsisHorizontalIcon className="h-4 w-4 mr-1" />} {priorityBadge[issue.priority]?.text || issue.priority}
                    </span>
                  </div>
                  {/* Issue name */}
                  <Typography variant="body" className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 line-clamp-2">
                    {issue.title}
                  </Typography>
                  {/* Labels (if any) */}
                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {issue.labels.map((label) => (
                        <span key={label.id} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: (label.color || '#888') + '22', color: label.color || '#555' }}>
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Bottom row: key (left), assignee avatar (right) */}
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <Typography variant="body-xs" className="text-neutral-400 font-mono">{issue.key}</Typography>
                    {issue.assignee ? (
                      typeof issue.assignee === 'object' ? (
                        <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600" title={issue.assignee.name || '?'}>
                          {issue.assignee.avatarUrl ? (
                            <Image src={issue.assignee.avatarUrl} alt={issue.assignee.name || '?'} className="w-full h-full object-cover" width={32} height={32} />
                          ) : (
                            <span>{issue.assignee.name ? issue.assignee.name[0] : <UserIcon className="h-4 w-4 text-neutral-400" />}</span>
                          )}
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600" title={issue.assignee}>
                          <span>{issue.assignee[0] || <UserIcon className="h-4 w-4 text-neutral-400" />}</span>
                        </div>
                      )
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-200 dark:border-neutral-700">
                        <UserIcon className="h-4 w-4 text-neutral-300" />
                      </div>
                    )}
                  </div>
                </Card>
              </SortableIssueCard>
            );
          })}
          {showCreateForm === col.id ? (
            <QuickCreateIssueForm
              projectId={projectId}
              status={col.name}
              onClose={() => setShowCreateForm(null)}
              onIssueCreated={() => {
                setShowCreateForm(null);
                refetch();
              }}
            />
          ) : (
            ['Super-Admin', 'ProjectLead', 'Developer', 'QA'].includes(currentUserRole ?? "") && (
              <Button
                onClick={() => setShowCreateForm(col.id)}
                variant="secondary"
                size="sm"
                className="mt-2 w-full"
              >
                <PlusIconSolid className="h-4 w-4 mr-2" />
                Add Issue
              </Button>
            )
          )}
        </div>
      </div>
    </SortableContext>
  );
};

export default function BoardPage() {
  const { id: projectId, bid: boardId } = useParams<{ id: string; bid: string }>();
  const { board, columns, isLoading: loadingBoard, isError: errorBoard,
          updateBoard, deleteBoard, addColumn, updateColumn, deleteColumn, reorderColumns 
        } = useBoard(projectId, boardId);
  const { issuesByColumn, isLoading: loadingIssues, isError: errorIssues, refetch } = useBoardIssues(projectId, columns);
  const updateIssueStatus = useUpdateIssueStatus(projectId);
  const reorderIssues = useReorderBoardIssues(projectId, boardId);
  const { showToast } = useToast();
  const { user } = useAuth();
  const { currentUserRole } = useProject(projectId);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState<string | null>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  // Real-time board events
  React.useEffect(() => {
    // Connect and join board room
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    const socket = getSocket() || connectSocket(token || '');
    socket.emit('join-board', { projectId, boardId });
    // Listen for board events
    const handleBoardEvent = (event: unknown) => {
      if (typeof event === 'object' && event !== null && 'userId' in event) {
        const evt = event as { userId: string };
        refetch(); // refetch issues on any board event
        if (evt.userId && user && evt.userId !== user.id) {
          showToast('Board updated by another user', 'info');
        }
        return;
      }
      refetch();
    };
    socket.on('issue-moved', handleBoardEvent);
    socket.on('issue-reordered', handleBoardEvent);
    // Cleanup on unmount
    return () => {
      socket.emit('leave-board', { projectId, boardId });
      socket.off('issue-moved', handleBoardEvent);
      socket.off('issue-reordered', handleBoardEvent);
    };
  }, [projectId, boardId, refetch, showToast, user]);

  // dnd-kit: onDragEnd handler for issues
  function handleDragStart(event: DragStartEvent) {
    setActiveIssueId(event.active.id as string);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveIssueId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source and destination columns
    let sourceCol: string | undefined;
    let destCol: string | undefined;
    for (const col of columns) {
      const ids = (issuesByColumn[col.name] || []).filter(issue => !issue.parentId).map(issue => issue.id);
      if (ids.includes(activeId)) sourceCol = col.name;
      if (ids.includes(overId)) destCol = col.name;
    }
    // If dropped on a column (not an issue), use that column
    if (!destCol) {
      const col = columns.find(c => c.id === overId);
      if (col) destCol = col.name;
    }
    if (!sourceCol || !destCol) return;

    // If moved to a new column (including dropping on a column itself)
    if (sourceCol !== destCol) {
      updateIssueStatus.mutate({ issueId: activeId, status: destCol });
      return;
    }

    // If reordered within the same column
    const colIssues = (issuesByColumn[sourceCol] || []).filter(issue => !issue.parentId);
    const oldIndex = colIssues.findIndex(issue => issue.id === activeId);
    let newIndex = colIssues.findIndex(issue => issue.id === overId);
    // If dropped on the column itself (not an issue), move to end
    if (columns.some(c => c.id === overId)) {
      newIndex = colIssues.length - 1;
    }
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const newOrder = arrayMove(colIssues, oldIndex, newIndex).map(i => i.id);
      const colObj = columns.find(c => c.name === sourceCol);
      if (colObj) {
        reorderIssues.mutate({ columnId: colObj.id, orderedIssueIds: newOrder });
      }
    }
  }
  
  // Handlers for board/column management
  const handleBoardRename = async (name: string) => {
    await updateBoard(name);
    showToast('Board renamed!', 'success');
  };
  const handleBoardDelete = async () => {
    await deleteBoard();
    // Redirect or show a message, e.g., router.push(`/projects/${projectId}/boards`);
    showToast('Board deleted!', 'success');
  };
  const handleColumnAdd = async (name: string) => {
    await addColumn(name);
    showToast('Column added!', 'success');
  };
  const handleColumnEdit = async (columnId: string, name: string) => {
    await updateColumn({ columnId, name });
    showToast('Column updated!', 'success');
  };
  const handleColumnDelete = async (columnId: string) => {
    await deleteColumn(columnId);
    showToast('Column deleted!', 'success');
  };
  const handleColumnsReorder = async (orderedIds: string[]) => {
    await reorderColumns(orderedIds);
    showToast('Columns reordered!', 'success');
  };

  if (loadingBoard || loadingIssues) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Loading board...
          </Typography>
        </div>
      </div>
    );
  }
  if (errorBoard || !board) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Typography variant="h3" className="text-red-600 dark:text-red-400 mb-2">
            Failed to load board
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Please try refreshing the page
          </Typography>
        </div>
      </div>
    );
  }
  if (errorIssues) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Typography variant="h3" className="text-red-600 dark:text-red-400 mb-2">
            Failed to load issues
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Please try refreshing the page
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Clean Board Header */}
      <header className="bg-white dark:bg-neutral-800 border-b-2 border-neutral-300 dark:border-neutral-600 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Typography variant="h2" className="text-neutral-900 dark:text-white font-semibold">
            {board.name}
            </Typography>
        </div>
        {currentUserRole === 'ProjectLead' && (
          <Button
            onClick={() => setIsManageModalOpen(true)}
              variant="primary"
              size="md"
          >
              Manage Board
          </Button>
        )}
        </div>
      </header>

      {isManageModalOpen && (
        <BoardManagementModal
          open={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          projectId={projectId}
          boardId={boardId}
          columns={columns}
          boardName={board.name}
          onBoardRename={handleBoardRename}
          onBoardDelete={handleBoardDelete}
          onColumnAdd={handleColumnAdd}
          onColumnEdit={handleColumnEdit}
          onColumnDelete={handleColumnDelete}
          onColumnsReorder={handleColumnsReorder}
        />
      )}

      {/* Board Content Area */}
      <main className="p-6">
        <DndContext onDragEnd={onDragEnd} onDragStart={handleDragStart} collisionDetection={closestCenter}>
          <div className="flex flex-row flex-wrap gap-6 justify-start items-start w-full">
            {columns.map((col) => (
              <BoardColumn
                key={col.id}
                col={col}
                issuesByColumn={issuesByColumn}
                showCreateForm={showCreateForm}
                setShowCreateForm={setShowCreateForm}
                currentUserRole={currentUserRole}
                projectId={projectId}
                refetch={refetch}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
            {activeIssueId ? (() => {
              const issue = columns.flatMap(col => (issuesByColumn[col.name] || [])).find(i => i.id === activeIssueId);
              if (!issue) return null;
              return (
                <div className="pointer-events-none scale-105 shadow-2xl opacity-90">
                  <Card className="p-4 min-h-[100px] w-[320px]">
                    <div className="flex gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${typeBadge[issue.type]?.color || 'bg-gray-100 text-gray-500'}`}> 
                        {typeBadge[issue.type]?.icon || <TagIcon className="h-4 w-4 mr-1" />} {typeBadge[issue.type]?.text || issue.type}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${priorityBadge[issue.priority]?.color || 'bg-gray-100 text-gray-500'}`}> 
                        {priorityBadge[issue.priority]?.icon || <EllipsisHorizontalIcon className="h-4 w-4 mr-1" />} {priorityBadge[issue.priority]?.text || issue.priority}
                      </span>
                    </div>
                    <Typography variant="body" className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 line-clamp-2">
                      {issue.title}
                    </Typography>
                              {issue.labels && issue.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                                  {issue.labels.map((label) => (
                          <span key={label.id} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: (label.color || '#888') + '22', color: label.color || '#555' }}>
                                      {label.name}
                                    </span>
                                  ))}
                                </div>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <Typography variant="body-xs" className="text-neutral-400 font-mono">{issue.key}</Typography>
                      {issue.assignee ? (
                        typeof issue.assignee === 'object' ? (
                          <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600" title={issue.assignee.name || '?'}>
                            {issue.assignee.avatarUrl ? (
                              <Image src={issue.assignee.avatarUrl} alt={issue.assignee.name || '?'} className="w-full h-full object-cover" width={32} height={32} />
                            ) : (
                              <span>{issue.assignee.name ? issue.assignee.name[0] : <UserIcon className="h-4 w-4 text-neutral-400" />}</span>
                              )}
                            </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-300 dark:border-neutral-600" title={issue.assignee}>
                            <span>{issue.assignee[0] || <UserIcon className="h-4 w-4 text-neutral-400" />}</span>
                          </div>
                        )
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold overflow-hidden border border-neutral-200 dark:border-neutral-700">
                          <UserIcon className="h-4 w-4 text-neutral-300" />
                        </div>
                      )}
                    </div>
                  </Card>
          </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
} 