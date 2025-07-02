import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

// Returns { [status: string]: Issue[] }
export function useBoardIssues(projectId: string, columns: { name: string }[]) {
  const { data, isLoading, isError, refetch } = useQuery<Issue[]>({
    queryKey: ['project-issues', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/issues`),
    enabled: !!projectId,
  });

  // Group issues by status (column name)
  const grouped: Record<string, Issue[]> = {};
  if (columns && data) {
    columns.forEach(col => {
      grouped[col.name] = data.filter(issue => issue.status === col.name);
    });
  }

  return { issuesByColumn: grouped, isLoading, isError, refetch };
} 