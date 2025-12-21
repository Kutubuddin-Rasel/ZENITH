import React, { useState } from 'react';
import Modal from '../Modal';
import Button from '../Button';
import Input from '../Input';
import Label from '../Label';
import { invitationsApi } from '../../lib/api/invitations';
import { useToast } from '../../context/ToastContext';

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    organizationId: string;
    onInviteSent: () => void;
}

const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, organizationId, onInviteSent }) => {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('Member');
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await invitationsApi.inviteUser(organizationId, email, role);
            showToast('Invitation sent successfully', 'success');
            setEmail('');
            setRole('Member');
            onInviteSent();
            onClose();
        } catch (err) {
            const error = err as Error;
            showToast(error.message || 'Failed to send invitation', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={isOpen} onClose={onClose} title="Invite Member">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="colleague@example.com"
                        required
                        className="w-full"
                    />
                </div>
                <div>
                    <Label htmlFor="role">Role</Label>
                    <select
                        id="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm dark:bg-neutral-800 dark:border-neutral-700 dark:text-white p-2 border"
                    >
                        <option value="Member">Member</option>
                        <option value="Admin">Admin</option>
                        <option value="Viewer">Viewer</option>
                    </select>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <Button variant="secondary" onClick={onClose} type="button">
                        Cancel
                    </Button>
                    <Button type="submit" loading={loading}>
                        Send Invite
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default InviteModal;
