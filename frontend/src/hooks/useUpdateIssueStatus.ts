import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

/**
 * Hook to update issue status via drag-and-drop.
 * RELATIONAL STATUS: Prefers statusId (UUID) as source of truth.
 * - If statusId is provided, sends it to the backend
 * - Backend will update both statusId and legacy status string
 */
export function useUpdateIssueStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, statusId, status }: { issueId: string; statusId?: string; status?: string }) => {
      const body = statusId
        ? { statusId }
        : { status };

      const response = await apiFetch(`/projects/${projectId}/issues/${issueId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return response;
    },
    onMutate: async ({ issueId, statusId, status }) => {
      const queryKey = ['project-issues', projectId];
      await queryClient.cancelQueries({ queryKey });
      const previousIssues = queryClient.getQueryData<Issue[]>(queryKey);

      if (previousIssues) {
        queryClient.setQueryData(queryKey, previousIssues.map(issue =>
          issue.id === issueId
            ? { ...issue, statusId: statusId ?? issue.statusId, status: status ?? issue.status }
            : issue
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
      queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
      queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
    },
  });
}
