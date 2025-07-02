import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

export function useSprintIssues(projectId: string, sprintId: string) {
  const { data, isLoading, isError } = useQuery<Issue[]>({
    queryKey: ['sprint-issues', projectId, sprintId],
    queryFn: () => apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`),
    enabled: !!projectId && !!sprintId,
  });
  return { issues: data, isLoading, isError };
}

export function useReorderSprintIssues(projectId: string, sprintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newOrder: string[]) =>
      apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
        method: 'PATCH',
        body: JSON.stringify({ issueIds: newOrder }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, sprintId] });
    },
  });
} 