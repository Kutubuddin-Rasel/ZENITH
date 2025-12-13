import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

export function useBacklog(projectId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<Issue[]>({
    queryKey: ['backlog', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/backlog`),
    enabled: !!projectId,
  });

  const reorderBacklog = useMutation({
    mutationFn: async (issueIds: string[]) => {
      // Use apiFetch for POST
      return apiFetch(`/projects/${projectId}/backlog/reorder`, {
        method: 'POST',
        body: JSON.stringify({ issueIds }),
      });
    },
    onMutate: async (newOrder) => {
      await queryClient.cancelQueries({ queryKey: ['backlog', projectId] });
      const previousBacklog = queryClient.getQueryData<Issue[]>(['backlog', projectId]);
      if (previousBacklog) {
        const idMap = new Map(previousBacklog.map(i => [i.id, i]));
        const newBacklog = newOrder.map(id => idMap.get(id)).filter(Boolean) as Issue[];
        // Optimistic update
        queryClient.setQueryData(['backlog', projectId], newBacklog);
      }
      return { previousBacklog };
    },
    onError: (err, newOrder, context) => {
      if (context?.previousBacklog) {
        queryClient.setQueryData(['backlog', projectId], context.previousBacklog);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
    },
  });

  return {
    issues: data,
    isLoading,
    isError,
    reorderBacklog,
  };
} 