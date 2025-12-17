
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

export interface WorkflowStatus {
    id: string;
    name: string;
    category: {
        key: string;
        name: string;
    };
    colorHex: string;
    position: number;
    isDefault: boolean;
}

export function useProjectStatuses(projectId: string) {
    return useQuery<WorkflowStatus[]>({
        queryKey: ['project-statuses', projectId],
        queryFn: () => apiFetch(`/projects/${projectId}/statuses`),
        enabled: !!projectId,
    });
}
