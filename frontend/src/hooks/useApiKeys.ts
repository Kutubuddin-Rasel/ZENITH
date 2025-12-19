import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

interface ApiKey {
    id: string;
    name: string;
    keyPrefix: string;
    scopes?: string[];
    projectId?: string;
    expiresAt?: string;
    lastUsedAt?: string;
    createdAt: string;
    isActive: boolean;
}

interface CreateApiKeyResponse {
    key: string; // Raw token - shown only once!
    apiKey: ApiKey;
}

/**
 * Fetch all API keys for current user
 */
export function useApiKeys() {
    return useQuery({
        queryKey: ['api-keys'],
        queryFn: async (): Promise<ApiKey[]> => {
            return apiFetch<ApiKey[]>('/api-keys');
        },
    });
}

/**
 * Create a new API key
 */
export function useCreateApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { name: string; expiresAt?: string }) => {
            return apiFetch<CreateApiKeyResponse>('/api-keys', {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        },
    });
}

/**
 * Revoke (delete) an API key
 */
export function useRevokeApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            return apiFetch(`/api-keys/${id}`, {
                method: 'DELETE',
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        },
    });
}

/**
 * Upload avatar
 */
export function useUploadAvatar() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('avatar', file);

            // Don't use JSON content-type for file upload
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/users/me/avatar`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to upload avatar');
            }

            return response.json() as Promise<{ success: boolean; avatarUrl: string }>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['auth'] });
            queryClient.invalidateQueries({ queryKey: ['user'] });
        },
    });
}
