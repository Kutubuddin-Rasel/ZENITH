import React, { useEffect, useState, useCallback } from 'react';
import { invitationsApi, Invite } from '../../lib/api/invitations';
import { useToast } from '../../context/ToastContext';
import { TrashIcon } from '@heroicons/react/24/outline';

interface PendingInvitesListProps {
    organizationId: string;
    refreshTrigger: number; // Prop to trigger refresh
}

const PendingInvitesList: React.FC<PendingInvitesListProps> = ({ organizationId, refreshTrigger }) => {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    const fetchInvites = useCallback(async () => {
        try {
            setLoading(true);
            const data = await invitationsApi.getPendingInvites(organizationId);
            setInvites(data);
        } catch (error) {
            console.error('Failed to fetch invites', error);
        } finally {
            setLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites, refreshTrigger]);

    const handleRevoke = async (inviteId: string) => {
        if (!confirm('Are you sure you want to revoke this invitation?')) return;
        try {
            await invitationsApi.revokeInvite(organizationId, inviteId);
            showToast('Invitation revoked', 'success');
            fetchInvites();
        } catch (err) {
            const error = err as Error;
            showToast(error.message || 'Failed to revoke invitation', 'error');
        }
    };

    if (loading && invites.length === 0) {
        return <div className="text-center py-4 text-gray-500">Loading invites...</div>;
    }

    if (invites.length === 0) {
        return <div className="text-center py-4 text-gray-500">No pending invitations.</div>;
    }

    return (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
                            Email
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Role
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Sent By
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Sent At
                        </th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                            <span className="sr-only">Actions</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                    {invites.map((invite) => (
                        <tr key={invite.id}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
                                {invite.email}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">
                                {invite.role}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">
                                {invite.invitedBy?.name || invite.invitedBy?.email}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-300">
                                {new Date(invite.createdAt).toLocaleDateString()}
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                <button
                                    onClick={() => handleRevoke(invite.id)}
                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                >
                                    <TrashIcon className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PendingInvitesList;
