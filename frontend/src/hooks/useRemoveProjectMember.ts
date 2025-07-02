import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      return apiFetch(`/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      // Invalidate project members
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      // Invalidate all user search queries (for this project)
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
      // Invalidate available employees list
      queryClient.invalidateQueries({ queryKey: ['available-employees'] });
      // Invalidate user project memberships (for RoleContext)
      queryClient.invalidateQueries({ queryKey: ['user-project-memberships'] });
      // Force refresh of RoleContext
      if (typeof window !== 'undefined') {
        // Trigger a custom event to refresh RoleContext
        window.dispatchEvent(new CustomEvent('refresh-roles'));
      }
    },
  });
} 