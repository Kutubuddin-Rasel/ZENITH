import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface VelocityData {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
  committedPoints: number;
  sprintStart: string;
  sprintEnd: string;
}

export interface BurndownData {
  sprintId: string;
  sprintName: string;
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
  sprintStart: string;
  sprintEnd: string;
  totalDays: number;
  pointsPerDay: number;
  completionPercentage: number;
}

export interface CumulativeFlowData {
  date: string;
  [key: string]: string | number; // Dynamic status fields
}

export interface EpicProgressData {
  epicId: string;
  epicTitle: string;
  epicStatus: string;
  totalStories: number;
  completedStories: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  completionPercentage: number;
  storyPointsCompletionPercentage: number;
  startDate?: string;
  endDate?: string;
}

export interface IssueBreakdownData {
  typeBreakdown: { [key: string]: number };
  priorityBreakdown: { [key: string]: number };
  statusBreakdown: { [key: string]: number };
  assigneeBreakdown: { [key: string]: number };
  totalIssues: number;
}

export function useVelocityReport(projectId: string) {
  const { data, isLoading, isError, error } = useQuery<VelocityData[]>({
    queryKey: ['reports', projectId, 'velocity'],
    queryFn: () => apiFetch(`/projects/${projectId}/reports/velocity`),
    enabled: !!projectId,
  });

  return {
    data,
    isLoading,
    isError,
    error,
  };
}

export function useBurndownReport(projectId: string, sprintId?: string) {
  const { data, isLoading, isError, error } = useQuery<BurndownData[]>({
    queryKey: ['reports', projectId, 'burndown', sprintId],
    queryFn: () => {
      const params = sprintId ? `?sprintId=${sprintId}` : '';
      return apiFetch(`/projects/${projectId}/reports/burndown${params}`);
    },
    enabled: !!projectId,
  });

  return {
    data,
    isLoading,
    isError,
    error,
  };
}

export function useCumulativeFlowReport(projectId: string, days: number = 30) {
  const { data, isLoading, isError, error } = useQuery<CumulativeFlowData[]>({
    queryKey: ['reports', projectId, 'cumulative-flow', days],
    queryFn: () => apiFetch(`/projects/${projectId}/reports/cumulative-flow?days=${days}`),
    enabled: !!projectId,
  });

  return {
    data,
    isLoading,
    isError,
    error,
  };
}

export function useEpicProgressReport(projectId: string) {
  const { data, isLoading, isError, error } = useQuery<EpicProgressData[]>({
    queryKey: ['reports', projectId, 'epic-progress'],
    queryFn: () => apiFetch(`/projects/${projectId}/reports/epic-progress`),
    enabled: !!projectId,
  });

  return {
    data,
    isLoading,
    isError,
    error,
  };
}

export function useIssueBreakdownReport(projectId: string) {
  const { data, isLoading, isError, error } = useQuery<IssueBreakdownData>({
    queryKey: ['reports', projectId, 'issue-breakdown'],
    queryFn: () => apiFetch(`/projects/${projectId}/reports/issue-breakdown`),
    enabled: !!projectId,
  });

  return {
    data,
    isLoading,
    isError,
    error,
  };
}