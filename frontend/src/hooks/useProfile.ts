import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

interface UpdateProfileData {
    name?: string;
    email?: string;
    avatarUrl?: string;
}

interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}

/**
 * Hook to update the current user's profile
 * Calls PATCH /users/:id with the updated fields
 */
export function useUpdateProfile(userId: string | undefined) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            if (!userId) throw new Error('User ID is required');
            return apiFetch<User>(`/users/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' },
            });
        },
        onSuccess: (updatedUser) => {
            // Invalidate user-related queries
            queryClient.invalidateQueries({ queryKey: ['user', userId] });
            queryClient.invalidateQueries({ queryKey: ['auth'] });

            // Update the cached user data
            queryClient.setQueryData(['user', userId], updatedUser);
        },
    });
}

/**
 * Hook to delete the current user's account
 * Calls DELETE /users/:id
 */
export function useDeleteAccount(userId: string | undefined) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error('User ID is required');
            return apiFetch(`/users/${userId}`, {
                method: 'DELETE',
            });
        },
        onSuccess: () => {
            // Clear all cached data on account deletion
            queryClient.clear();
        },
    });
}
