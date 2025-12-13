import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

export interface BoardColumnInfo {
  id: string;
  name: string; // Linear-style: column name IS the status
}

/**
 * Hook to fetch and group issues by board columns.
 * Linear-style: issue.status === column.name
 * 
 * When an issue's status matches a column's name, 
 * the issue appears in that column. Simple and intuitive.
 */
export function useBoardIssues(projectId: string, columns: BoardColumnInfo[]) {
  const { data, isLoading, isError, refetch } = useQuery<Issue[]>({
    queryKey: ['project-issues', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/issues`),
    enabled: !!projectId,
  });

  // Group issues by column: issue.status === column.name
  const grouped: Record<string, Issue[]> = {};
  if (columns && data) {
    columns.forEach(col => {
      // Linear-style: column name IS the status
      grouped[col.id] = data.filter(issue => issue.status === col.name);
    });
  }

  return { issuesByColumn: grouped, isLoading, isError, refetch };
}