import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

export interface BoardColumnInfo {
  id: string;
  name: string; // Linear-style: column name for display
  statusId?: string | null; // NEW: Relational status ID (source of truth)
}

/**
 * Hook to fetch and group issues by board columns.
 * RELATIONAL STATUS: Primary matching by statusId, fallback to string for legacy data.
 * 
 * - If both issue.statusId and column.statusId exist, match by ID (source of truth)
 * - Otherwise, fallback to issue.status === column.name (legacy compatibility)
 */
export function useBoardIssues(projectId: string, columns: BoardColumnInfo[]) {
  const { data, isLoading, isError, refetch } = useQuery<Issue[]>({
    queryKey: ['project-issues', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/issues`),
    enabled: !!projectId,
  });

  // Group issues by column: prefer statusId, fallback to string
  const grouped: Record<string, Issue[]> = {};
  if (columns && data) {
    columns.forEach(col => {
      // RELATIONAL STATUS: Hybrid matching
      grouped[col.id] = data.filter(issue => {
        // Primary: Match by statusId if both are available
        if (col.statusId && issue.statusId) {
          return issue.statusId === col.statusId;
        }
        // Fallback: Match by string name (legacy data)
        return issue.status === col.name;
      });
    });
  }

  return { issuesByColumn: grouped, isLoading, isError, refetch };
}