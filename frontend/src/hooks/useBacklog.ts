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
    mutationFn: (newOrder: string[]) =>
      apiFetch(`/projects/${projectId}/backlog`, {
        method: 'PATCH',
        body: JSON.stringify({ issueIds: newOrder }),
      }),
    onSuccess: () => {
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