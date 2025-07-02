import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface ProjectSummary {
  projectId: string;
  projectName: string;
  totalIssues: number;
  doneIssues: number;
  percentDone: number;
  statusCounts: Record<string, number>;
}

export function useProjectSummary(projectId: string) {
  const { data, isLoading, error } = useQuery<ProjectSummary>({
    queryKey: ['project-summary', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/summary`),
    enabled: !!projectId,
  });
  return { summary: data, isLoading, error };
} 