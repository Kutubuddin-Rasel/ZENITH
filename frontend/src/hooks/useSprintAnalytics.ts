import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Sprint } from './useSprints';

interface Snapshot {
    id: string;
    date: string;
    totalPoints: number;
    completedPoints: number;
    remainingPoints: number;
}

interface BurndownData {
    sprint: Sprint;
    snapshots: Snapshot[];
    idealBurnRate: number;
    initialScope: number;
}

interface VelocityData {
    sprintId: string;
    sprintName: string;
    completedPoints: number;
    totalPoints: number;
}

export function useBurndown(projectId: string, sprintId: string) {
    const { data, isLoading, isError } = useQuery<BurndownData>({
        queryKey: ['sprint-burndown', projectId, sprintId],
        queryFn: () => apiFetch(`/projects/${projectId}/sprints/${sprintId}/burndown`),
        enabled: !!projectId && !!sprintId,
    });
    return { data, isLoading, isError };
}

export function useVelocity(projectId: string) {
    const { data, isLoading, isError } = useQuery<VelocityData[]>({
        queryKey: ['project-velocity', projectId],
        queryFn: () => apiFetch(`/projects/${projectId}/sprints/analytics/velocity`),
        enabled: !!projectId,
    });
    return { data, isLoading, isError };
}
