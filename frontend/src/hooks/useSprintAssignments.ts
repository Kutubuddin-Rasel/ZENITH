import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export function useSprintAssignments(projectId: string) {
    const queryClient = useQueryClient();

    const assignToSprint = useMutation({
        mutationFn: async ({ issueId, sprintId }: { issueId: string; sprintId: string }) => {
            return apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
                method: 'POST',
                body: JSON.stringify({ issueId }),
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, variables.sprintId] });
            queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
        },
    });

    const removeFromSprint = useMutation({
        mutationFn: async ({ issueId, sprintId }: { issueId: string; sprintId: string }) => {
            return apiFetch(`/projects/${projectId}/sprints/${sprintId}/issues`, {
                method: 'DELETE',
                body: JSON.stringify({ issueId }),
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sprint-issues', projectId, variables.sprintId] });
            queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
        },
    });

    return { assignToSprint, removeFromSprint };
}
