import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface BoardColumn {
  id: string;
  name: string;
  status: string;
  columnOrder: number;
}

export interface Board {
  id: string;
  name: string;
  columns: BoardColumn[];
}

export function useBoard(projectId: string, boardId: string) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<Board>({
    queryKey: ['board', projectId, boardId],
    queryFn: () => apiFetch(`/projects/${projectId}/boards/${boardId}`),
    enabled: !!projectId && !!boardId,
  });

  const updateBoard = useMutation({
    mutationFn: (name: string) => apiFetch(`/projects/${projectId}/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', projectId, boardId] }),
  });

  const deleteBoard = useMutation({
    mutationFn: () => apiFetch(`/projects/${projectId}/boards/${boardId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boards', projectId] }), // Invalidate list
  });

  const addColumn = useMutation({
    mutationFn: (name: string) => apiFetch(`/projects/${projectId}/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify({ name, status: name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', projectId, boardId] }),
  });

  const updateColumn = useMutation({
    mutationFn: ({ columnId, name }: { columnId: string, name: string }) => apiFetch(`/projects/${projectId}/boards/${boardId}/columns/${columnId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', projectId, boardId] }),
  });

  const deleteColumn = useMutation({
    mutationFn: (columnId: string) => apiFetch(`/projects/${projectId}/boards/${boardId}/columns/${columnId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', projectId, boardId] }),
  });
  
  const reorderColumns = useMutation({
    mutationFn: (orderedIds: string[]) => {
      // In a real app, you'd likely have a dedicated endpoint for this
      // For now, we'll update each column's order individually
      return Promise.all(orderedIds.map((id, idx) => 
        apiFetch(`/projects/${projectId}/boards/${boardId}/columns/${id}`, { method: 'PATCH', body: JSON.stringify({ columnOrder: idx }) })
      ));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', projectId, boardId] }),
  });

  return {
    board: data,
    columns: data?.columns.sort((a,b) => (a.columnOrder ?? 0) - (b.columnOrder ?? 0)) || [],
    isLoading,
    isError,
    updateBoard: updateBoard.mutateAsync,
    deleteBoard: deleteBoard.mutateAsync,
    addColumn: addColumn.mutateAsync,
    updateColumn: updateColumn.mutateAsync,
    deleteColumn: deleteColumn.mutateAsync,
    reorderColumns: reorderColumns.mutateAsync,
  };
} 