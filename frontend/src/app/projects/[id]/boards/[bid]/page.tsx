"use client";
import React, { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useBoard } from "@/hooks/useBoard";
import type { BoardColumn } from "@/hooks/useBoard";
import { useBoardIssues } from "@/hooks/useBoardIssues";
import { useUpdateIssueStatus } from "@/hooks/useUpdateIssueStatus";
import { useReorderBoardIssues } from "@/hooks/useReorderBoardIssues";
import Spinner from "@/components/Spinner";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Issue } from '@/hooks/useProjectIssues';
import { connectSocket, getSocket } from '@/lib/socket';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import BoardManagementModal from "@/components/BoardManagementModal";
import { useProject } from "@/hooks/useProject";
import Button from "@/components/Button";
import { PlusIcon } from '@heroicons/react/24/solid';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import QuickCreateIssueForm from "@/components/QuickCreateIssueForm";
import Typography from "@/components/Typography";
import { DraggableCard, DragOverlayCard, DragContext } from "@/components/DraggableCard";
import { DROP_ANIMATION, DRAG_ACTIVATION_CONSTRAINT } from "@/lib/drag-physics";

// ============================================================================
// DROPPABLE COLUMN CONTAINER
// ============================================================================

interface DroppableColumnProps {
  col: BoardColumn;
  issues: Issue[];
  isOver: boolean;
  showCreateForm: string | null;
  setShowCreateForm: (id: string | null) => void;
  currentUserRole: string | undefined;
  projectId: string;
  boardId: string;
  refetch: () => void;
}

function DroppableColumn({
  col,
  issues,
  isOver,
  showCreateForm,
  setShowCreateForm,
  currentUserRole,
  projectId,
  boardId,
  refetch,
}: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({
    id: col.id,
    data: {
      type: 'column',
      columnId: col.id,
      statusId: col.statusId,
      statusName: col.name,
    }
  });

  const context: DragContext = {
    type: 'board',
    boardId,
    columnId: col.id
  };

  // Filter out sub-tasks from top level
  const topLevelIssues = issues.filter(issue => !issue.parentId);
  const issueIds = topLevelIssues.map(issue => issue.id);

  return (
    <div
      ref={setNodeRef}
      className={`
        relative flex-shrink-0 w-[300px] max-h-full flex flex-col 
        rounded-xl bg-neutral-100 dark:bg-neutral-800/80
        border border-neutral-200 dark:border-neutral-700
        shadow-sm transition-all duration-200
        ${isOver
          ? 'ring-2 ring-blue-500 ring-opacity-50 bg-blue-50/50 dark:bg-blue-950/20 border-blue-400'
          : ''
        }
      `}
    >
      {/* Column Header */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-800 rounded-t-xl sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="h4" className="text-neutral-700 dark:text-neutral-200 font-semibold uppercase text-xs tracking-wider">
              {col.name}
            </Typography>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              {topLevelIssues.length}
            </span>
          </div>
          <button className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-400 transition-colors">
            <EllipsisHorizontalIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Issues List - Scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-3 min-h-0 custom-scrollbar">
        {issueIds.length === 0 && !showCreateForm ? (
          <div className={`
            flex flex-col items-center justify-center text-neutral-400 text-sm text-center py-10 rounded-lg
            ${isOver ? 'bg-blue-50 dark:bg-blue-950/20 border-2 border-dashed border-blue-300 dark:border-blue-700' : ''}
          `}>
            <svg width="40" height="40" fill="none" viewBox="0 0 40 40" className="mb-3 text-neutral-300 dark:text-neutral-600">
              <rect x="6" y="10" width="28" height="20" rx="4" fill="currentColor" opacity="0.15" />
              <rect x="10" y="16" width="20" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
              <rect x="10" y="22" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.2" />
            </svg>
            <span className="font-medium">No issues</span>
            {isOver && <span className="block mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium">Drop here</span>}
          </div>
        ) : (
          <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
            {topLevelIssues.map(issue => (
              <DraggableCard
                key={issue.id}
                issue={issue}
                context={context}
                variant="card"
              />
            ))}
          </SortableContext>
        )}

        {/* Quick Create Form */}
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
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Issue
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN BOARD PAGE
// ============================================================================

export default function BoardPage() {
  const { id: projectId, bid: boardId } = useParams<{ id: string; bid: string }>();
  const {
    board,
    columns,
    isLoading: loadingBoard,
    isError: errorBoard,
    updateBoard,
    deleteBoard,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns
  } = useBoard(projectId, boardId);
  const { issuesByColumn, isLoading: loadingIssues, isError: errorIssues, refetch } = useBoardIssues(projectId, columns);
  const updateIssueStatus = useUpdateIssueStatus(projectId);
  const reorderIssues = useReorderBoardIssues(projectId, boardId);
  const { showToast } = useToast();
  const { user } = useAuth();
  const { currentUserRole } = useProject(projectId);

  // UI State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<{ issue: Issue; context: DragContext } | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  // Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: DRAG_ACTIVATION_CONSTRAINT,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Real-time socket events
  React.useEffect(() => {
    const initSocket = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const socket = getSocket() || await connectSocket(token || '');

      if (socket) {
        socket.emit('join-board', { projectId, boardId });

        const handleBoardEvent = (event: unknown) => {
          if (typeof event === 'object' && event !== null && 'userId' in event) {
            const evt = event as { userId: string };
            refetch();
            if (evt.userId && user && evt.userId !== user.id) {
              showToast('Board updated by another user', 'info');
            }
            return;
          }
          refetch();
        };

        socket.on('issue-moved', handleBoardEvent);
        socket.on('issue-reordered', handleBoardEvent);

        return () => {
          socket.emit('leave-board', { projectId, boardId });
          socket.off('issue-moved', handleBoardEvent);
          socket.off('issue-reordered', handleBoardEvent);
        };
      }
    };

    const cleanupPromise = initSocket();
    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, [projectId, boardId, refetch, showToast, user]);

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
      setOverColumnId(null);
      return;
    }

    const overId = String(over.id);
    const overData = over.data.current as { type?: string; columnId?: string } | undefined;

    // If over a column directly
    if (overData?.type === 'column' && overData.columnId) {
      setOverColumnId(overData.columnId);
    }
    // If over an issue, get its column
    else if (overData?.type === 'issue') {
      const context = (over.data.current as { context?: DragContext })?.context;
      if (context?.type === 'board' && context.columnId) {
        setOverColumnId(context.columnId);
      }
    }
    // Fallback: check if over ID matches a column
    else {
      const matchingCol = columns.find(c => c.id === overId);
      if (matchingCol) {
        setOverColumnId(matchingCol.id);
      }
    }
  }, [columns]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Reset state
    setActiveItem(null);
    setOverColumnId(null);

    if (!over) return;

    const activeData = active.data.current as { issue: Issue; context: DragContext } | undefined;
    if (!activeData) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const overData = over.data.current as {
      type?: string;
      columnId?: string;
      statusId?: string;
      statusName?: string;
    } | undefined;

    // Find source column
    let sourceColId: string | undefined;
    for (const col of columns) {
      const ids = (issuesByColumn[col.id] || []).filter(i => !i.parentId).map(i => i.id);
      if (ids.includes(activeId)) {
        sourceColId = col.id;
        break;
      }
    }

    // Find destination column
    let destColId: string | undefined;
    let destStatusId: string | null | undefined;

    if (overData?.type === 'column') {
      destColId = overData.columnId;
      destStatusId = overData.statusId;
    } else {
      // Dropped on an issue - find its column
      for (const col of columns) {
        const ids = (issuesByColumn[col.id] || []).filter(i => !i.parentId).map(i => i.id);
        if (ids.includes(overId)) {
          destColId = col.id;
          destStatusId = col.statusId;
          break;
        }
      }
      // Or dropped on column itself
      if (!destColId) {
        const col = columns.find(c => c.id === overId);
        if (col) {
          destColId = col.id;
          destStatusId = col.statusId;
        }
      }
    }

    if (!sourceColId || !destColId) return;

    // Case 1: Moved to a different column (status change)
    if (sourceColId !== destColId) {
      const destColumn = columns.find(c => c.id === destColId);
      if (destColumn) {
        if (destColumn.statusId) {
          updateIssueStatus.mutate({
            issueId: activeId,
            statusId: destColumn.statusId,
            status: destColumn.name
          });
        } else {
          updateIssueStatus.mutate({
            issueId: activeId,
            status: destColumn.name
          });
        }
      }
      return;
    }

    // Case 2: Reordered within the same column
    const colIssues = (issuesByColumn[sourceColId] || []).filter(issue => !issue.parentId);
    const oldIndex = colIssues.findIndex(issue => issue.id === activeId);
    let newIndex = colIssues.findIndex(issue => issue.id === overId);

    if (columns.some(c => c.id === overId)) {
      newIndex = colIssues.length - 1;
    }

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const newOrder = arrayMove(colIssues, oldIndex, newIndex).map(i => i.id);
      reorderIssues.mutate({ columnId: sourceColId, orderedIssueIds: newOrder });
    }
  }, [columns, issuesByColumn, updateIssueStatus, reorderIssues]);

  // =========================================================================
  // BOARD MANAGEMENT HANDLERS
  // =========================================================================

  const handleBoardRename = useCallback(async (name: string) => {
    await updateBoard(name);
    showToast('Board renamed!', 'success');
  }, [updateBoard, showToast]);

  const handleBoardDelete = useCallback(async () => {
    await deleteBoard();
    showToast('Board deleted!', 'success');
  }, [deleteBoard, showToast]);

  const handleColumnAdd = useCallback(async (name: string) => {
    await addColumn(name);
    showToast('Column added!', 'success');
  }, [addColumn, showToast]);

  const handleColumnEdit = useCallback(async (columnId: string, name: string) => {
    await updateColumn({ columnId, name });
    showToast('Column updated!', 'success');
  }, [updateColumn, showToast]);

  const handleColumnDelete = useCallback(async (columnId: string) => {
    await deleteColumn(columnId);
    showToast('Column deleted!', 'success');
  }, [deleteColumn, showToast]);

  const handleColumnsReorder = useCallback(async (orderedIds: string[]) => {
    await reorderColumns(orderedIds);
    showToast('Columns reordered!', 'success');
  }, [reorderColumns, showToast]);

  // =========================================================================
  // RENDER
  // =========================================================================

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
      {/* Board Header */}
      <header className="bg-white dark:bg-neutral-800 border-b-2 border-neutral-200 dark:border-neutral-700 px-6 py-4 shadow-sm">
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

      {/* Board Management Modal */}
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

      {/* Board Content */}
      <main className="flex-1 overflow-hidden h-[calc(100vh-73px)] p-4 bg-neutral-50 dark:bg-neutral-900">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* Horizontal scrolling container for columns */}
          <div className="flex flex-row flex-nowrap gap-4 overflow-x-auto h-full items-start justify-start w-full pb-4">
            {columns.map((col) => (
              <DroppableColumn
                key={col.id}
                col={col}
                issues={issuesByColumn[col.id] || []}
                isOver={overColumnId === col.id}
                showCreateForm={showCreateForm}
                setShowCreateForm={setShowCreateForm}
                currentUserRole={currentUserRole}
                projectId={projectId}
                boardId={boardId}
                refetch={refetch}
              />
            ))}
          </div>

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={DROP_ANIMATION}>
            {activeItem ? (
              <DragOverlayCard
                issue={activeItem.issue}
                context={activeItem.context}
                variant="card"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}