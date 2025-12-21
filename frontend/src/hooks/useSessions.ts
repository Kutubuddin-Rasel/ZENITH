import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

// Match the backend response structure
export interface UserSession {
    id: string;
    deviceType: string | null;
    browser: string | null;
    os: string | null;
    ipAddress: string | null;
    location: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    isCurrent: boolean;
}

interface SessionsResponse {
    sessions: UserSession[];
    total: number;
}

interface RevokeResponse {
    success: boolean;
    message: string;
    revokedCount?: number;
}

/**
 * Hook to fetch and manage user sessions
 * Uses the new /users/me/sessions API
 */
export function useSessions() {
    return useQuery<SessionsResponse>({
        queryKey: ['user-sessions'],
        queryFn: async () => {
            return apiClient.get<SessionsResponse>('/users/me/sessions');
        },
        staleTime: 30000, // 30 seconds
        refetchOnWindowFocus: true,
    });
}

/**
 * Hook to revoke a specific session
 */
export function useRevokeSession() {
    const queryClient = useQueryClient();

    return useMutation<RevokeResponse, Error, string>({
        mutationFn: async (sessionId: string) => {
            return apiClient.delete<RevokeResponse>(`/users/me/sessions/${sessionId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
        },
    });
}

/**
 * Hook to revoke all sessions (except current)
 */
export function useRevokeAllSessions() {
    const queryClient = useQueryClient();

    return useMutation<RevokeResponse, Error, void>({
        mutationFn: async () => {
            return apiClient.delete<RevokeResponse>('/users/me/sessions');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-sessions'] });
        },
    });
}
