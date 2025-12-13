import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues'; // Assuming Issue is exported from here

export function useUpdateIssueStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, status }: { issueId: string; status: string }) => {

      const response = await apiFetch(`/projects/${projectId}/issues/${issueId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      console.log('Status update response:', response);
      return response;
    },
    onMutate: async ({ issueId, status }) => {
      const queryKey = ['project-issues', projectId];
      await queryClient.cancelQueries({ queryKey });
      const previousIssues = queryClient.getQueryData<Issue[]>(queryKey);

      if (previousIssues) {
        queryClient.setQueryData(queryKey, previousIssues.map(issue =>
          issue.id === issueId ? { ...issue, status } : issue
        ));
      }
      return { previousIssues };
    },
    onError: (err, variables, context) => {
      if (context?.previousIssues) {
        queryClient.setQueryData(['project-issues', projectId], context.previousIssues);
      }
    },
    onSettled: () => {
      // Invalidate both project-issues and backlog queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      // Also invalidate any project summary queries that might show issue counts
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
  });
} 