import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

/**
 * Access settings interface matching backend ProjectAccessSettings entity
 */
export interface ProjectAccessSettings {
    id: string;
    projectId: string;
    accessControlEnabled: boolean;
    defaultPolicy: string;
    ipAllowlist: string[];
    countryAllowlist: string[];
    geographicFiltering: boolean;
    timeBasedFiltering: boolean;
    emergencyAccessEnabled: boolean;
    userSpecificRules: boolean;
    roleBasedRules: boolean;
    maxRulesPerUser: number;
    autoCleanupEnabled: boolean;
    cleanupIntervalHours: number;
    notificationEnabled: boolean;
    logAllAccess: boolean;
    requireApprovalForNewRules: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Partial update payload for access settings
 */
export type UpdateAccessSettingsPayload = Partial<Omit<ProjectAccessSettings, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>;

/**
 * Hook to fetch project access settings
 */
export function useProjectAccessSettings(projectId: string) {
    return useQuery({
        queryKey: ['project-access-settings', projectId],
        queryFn: async (): Promise<ProjectAccessSettings> => {
            return apiFetch<ProjectAccessSettings>(`/projects/${projectId}/access-settings`);
        },
        enabled: !!projectId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

/**
 * Hook to update project access settings with optimistic updates
 */
export function useUpdateProjectAccessSettings(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (update: UpdateAccessSettingsPayload) => {
            return apiFetch<ProjectAccessSettings>(`/projects/${projectId}/access-settings`, {
                method: 'PATCH',
                body: JSON.stringify(update),
                headers: { 'Content-Type': 'application/json' },
            });
        },
        // Optimistic update for instant UI feedback
        onMutate: async (update) => {
            await queryClient.cancelQueries({ queryKey: ['project-access-settings', projectId] });
            const previousSettings = queryClient.getQueryData<ProjectAccessSettings>(['project-access-settings', projectId]);

            if (previousSettings) {
                queryClient.setQueryData<ProjectAccessSettings>(['project-access-settings', projectId], {
                    ...previousSettings,
                    ...update,
                });
            }

            return { previousSettings };
        },
        onError: (_err, _update, context) => {
            // Rollback on error
            if (context?.previousSettings) {
                queryClient.setQueryData(['project-access-settings', projectId], context.previousSettings);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['project-access-settings', projectId] });
        },
    });
}
