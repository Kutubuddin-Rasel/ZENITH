import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export interface ProjectSecurityPolicy {
    id: string;
    projectId: string;
    // Authentication Requirements
    require2FA: boolean;
    requirePasswordMinLength: number;
    requirePasswordComplexity: boolean;
    passwordMaxAgeDays: number;
    // Session Requirements
    maxSessionTimeoutMinutes: number;
    enforceSessionTimeout: boolean;
    // Access Requirements
    requireIPAllowlist: boolean;
    blockedCountries: string[];
    // Notifications
    notifyOnPolicyViolation: boolean;
    notifyOnAccessDenied: boolean;
    // Metadata
    createdAt: string;
    updatedAt: string;
}

export type UpdateProjectSecurityPolicyDto = Partial<Omit<
    ProjectSecurityPolicy,
    'id' | 'projectId' | 'createdAt' | 'updatedAt'
>>;

/**
 * Hook to fetch project security policy
 */
export function useProjectSecurityPolicy(projectId: string) {
    return useQuery<ProjectSecurityPolicy>({
        queryKey: ['project-security-policy', projectId],
        queryFn: async () => {
            return apiClient.get<ProjectSecurityPolicy>(`/projects/${projectId}/security-policy`);
        },
        staleTime: 30000, // 30 seconds cache
        enabled: !!projectId,
    });
}

/**
 * Hook to update project security policy
 */
export function useUpdateProjectSecurityPolicy(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation<ProjectSecurityPolicy, Error, UpdateProjectSecurityPolicyDto>({
        mutationFn: async (updates: UpdateProjectSecurityPolicyDto) => {
            return apiClient.patch<ProjectSecurityPolicy>(`/projects/${projectId}/security-policy`, updates);
        },
        onSuccess: (data) => {
            queryClient.setQueryData(['project-security-policy', projectId], data);
        },
    });
}
