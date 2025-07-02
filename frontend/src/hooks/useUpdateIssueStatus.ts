import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export function useUpdateIssueStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, status }: { issueId: string; status: string }) => {
      console.log('Updating issue status:', { projectId, issueId, status });
      const response = await apiFetch(`/projects/${projectId}/issues/${issueId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      console.log('Status update response:', response);
      return response;
    },
    onSuccess: (data, variables) => {
      console.log('Status update successful:', { data, variables });
      // Invalidate both project-issues and backlog queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      // Also invalidate any project summary queries that might show issue counts
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
    onError: (error, variables) => {
      if (error instanceof Error) {
        console.error('Status update failed:', error.message, { error, variables });
      } else {
        console.error('Status update failed:', error, { variables });
      }
    },
  });
} 