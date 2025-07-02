import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

interface CreateIssueData {
  title: string;
  description?: string;
  priority: string;
  status: string;
  type: string;
  projectId: string;
  assigneeId?: string;
  estimatedHours: number;
}

interface Issue {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  type: string;
  projectId: string;
  assignee?: {
    id: string;
    name: string;
  };
  estimatedHours?: number;
  createdAt: string;
  updatedAt: string;
}

export function useCreateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateIssueData): Promise<Issue> => {
      return await apiFetch(`/projects/${data.projectId}/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (newIssue, variables) => {
      // Invalidate and refetch issues for this project
      queryClient.invalidateQueries({
        queryKey: ['project-issues', variables.projectId],
      });
      
      // Also invalidate project summary to update issue counts
      queryClient.invalidateQueries({
        queryKey: ['project', variables.projectId],
      });
    },
  });
} 