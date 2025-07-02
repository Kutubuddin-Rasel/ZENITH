import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

type InviteInput = 
  | { email: string; roleName: string }
  | { userId: string; roleName: string };

export function useInviteProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteInput) => {
      // Map frontend fields to backend DTO fields
      const backendData: any = {
        projectId,
        role: input.roleName,
      };
      
      if ('email' in input) {
        // For email invitations, we need to find the user first
        const users = await apiFetch(`/users/search?term=${input.email}`);
        if (users.length === 0) {
          throw new Error(`User with email ${input.email} not found`);
        }
        backendData.inviteeId = users[0].user_id;
      } else {
        // For user ID invitations
        backendData.inviteeId = input.userId;
      }
      
      return apiFetch(`/invites`, {
        method: 'POST',
        body: JSON.stringify(backendData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'invites'] });
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
    },
  });
}
