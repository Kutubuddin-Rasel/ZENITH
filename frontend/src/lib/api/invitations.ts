import { apiClient } from '../api-client';

export interface Invite {
    id: string;
    email: string;
    role: string;
    status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
    token: string;
    expiresAt: string;
    createdAt: string;
    invitedBy: {
        id: string;
        name: string;
        email: string;
    };
}

export const invitationsApi = {
    inviteUser: (organizationId: string, email: string, role: string) => {
        return apiClient.post<{ token: string }>(`/organizations/${organizationId}/invites`, {
            email,
            role,
        });
    },

    getPendingInvites: (organizationId: string) => {
        return apiClient.get<Invite[]>(`/organizations/${organizationId}/invites`);
    },

    revokeInvite: (organizationId: string, inviteId: string) => {
        return apiClient.delete(`/organizations/${organizationId}/invites/${inviteId}`);
    },

    validateInvite: (token: string) => {
        return apiClient.get<Invite>(`/invites/${token}`);
    },

    acceptInvite: (token: string) => {
        return apiClient.post(`/invites/${token}/accept`, {});
    },
};
