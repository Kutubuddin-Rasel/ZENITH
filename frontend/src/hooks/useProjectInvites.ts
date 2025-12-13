import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { useParams } from 'next/navigation';

export interface ProjectInvite {
  id: string;
  inviteeId: string;
  inviterId: string;
  projectId: string;
  role: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Revoked';
  createdAt: string;
  // This hook needs to be expanded to include user details
  // For now, we'll just use the IDs
  invitee: { name: string; email: string; avatar?: string };
  inviter: { name: string; email: string; avatar?: string };
}

interface CreateInvitePayload {
  inviteeId: string;
  role: string;
}

export function useProjectInvites() {
  const params = useParams();
  const projectId = params.id as string;
  const queryClient = useQueryClient();

  // This endpoint needs to be created on the backend
  const { data: invites, isLoading } = useQuery<ProjectInvite[]>({
    queryKey: ['projects', projectId, 'invites'],
    queryFn: () => apiFetch(`/projects/${projectId}/invites`),
    enabled: !!projectId,
  });

  const createInviteMutation = useMutation({
    mutationFn: (data: CreateInvitePayload) =>
      apiFetch(`/invites`, {
        method: 'POST',
        body: JSON.stringify({ ...data, projectId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'invites'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch(`/invites/${inviteId}/revoke`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'invites'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch(`/invites/${inviteId}/resend`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const respondToInviteMutation = useMutation({
    mutationFn: ({ inviteId, accept, reason }: { inviteId: string; accept: boolean; reason?: string }) => {

      return apiFetch(`/invites/${inviteId}/respond`, {
        method: 'PATCH',
        body: JSON.stringify({ accept, reason }),
      });
    },
    onSuccess: (data) => {
      console.log('✅ respondToInviteMutation: API call successful with data:', data);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'invites'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      console.error('❌ respondToInviteMutation: API call failed with error:', error);
    },
  });

  return {
    invites: invites ?? [],
    isLoading,
    createInvite: createInviteMutation.mutate,
    revokeInvite: revokeInviteMutation.mutate,
    resendInvite: resendInviteMutation.mutate,
    respondToInvite: respondToInviteMutation.mutate,
    respondToInviteMutation,
  };
} 