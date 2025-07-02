import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export function useMoveIssueToSprint(projectId: string, sprintId: string) {
  const queryClient = useQueryClient();

  const assignIssueToSprint = useMutation({
    mutationFn: (issueId: string) =>
      apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
        method: 'POST',
        body: JSON.stringify({ issueId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
    },
  });

  const removeIssueFromSprint = useMutation({
    mutationFn: (issueId: string) =>
      apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
        method: 'DELETE',
        body: JSON.stringify({ issueId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, sprintId] });
      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
    },
  });

  return { assignIssueToSprint, removeIssueFromSprint };
} 