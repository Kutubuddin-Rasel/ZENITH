import React, { useState } from 'react';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';
import { useInviteProjectMember } from '@/hooks/useInviteProjectMember';
import { useAvailableEmployees } from '@/hooks/useAvailableEmployees';
import { EnvelopeIcon, UserGroupIcon } from '@heroicons/react/24/outline';

const ROLES = [
  'ProjectLead',
  'Developer',
  'QA',
  'Viewer',
];

interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onInviteSent?: () => void;
  isInviting?: boolean;
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({ open, onClose, projectId, onInviteSent, isInviting = false }) => {
  const [activeTab, setActiveTab] = useState<'email' | 'select'>('email');
  const [email, setEmail] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState(ROLES[1]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const inviteMutation = useInviteProjectMember(projectId);
  const { data: availableEmployees = [], isLoading: loadingEmployees, refetch: refetchAvailableEmployees } = useAvailableEmployees();

  const filteredEmployees = availableEmployees.filter(employee =>
    employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError('Please enter an email address.');
      return;
    }
    if (!role) {
      setError('Please select a role.');
      return;
    }
    try {
      await inviteMutation.mutateAsync({ email, roleName: role });
      setEmail('');
      setRole(ROLES[1]);
      onInviteSent?.();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invite.';
      setError(errorMessage);
    }
  };

  const handleSelectInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedUserId) {
      setError('Please select a user.');
      return;
    }
    if (!role) {
      setError('Please select a role.');
      return;
    }
    try {
      await inviteMutation.mutateAsync({ userId: selectedUserId, roleName: role });
      setSelectedUserId('');
      setRole(ROLES[1]);
      refetchAvailableEmployees();
      onInviteSent?.();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invite.';
      setError(errorMessage);
    }
  };

  const handleSubmit = activeTab === 'email' ? handleEmailInvite : handleSelectInvite;

  return (
    <Modal open={open} onClose={onClose} title="Invite Team Member" maxWidthClass="sm:max-w-2xl">
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'email'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <EnvelopeIcon className="h-4 w-4" />
            Email Invite
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('select')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'select'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <UserGroupIcon className="h-4 w-4" />
            Select Employee
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Tab */}
          {activeTab === 'email' && (
            <Input
              label="User Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          )}

          {/* Select Tab */}
          {activeTab === 'select' && (
            <div className="space-y-4">
              <div>
                <label className="block mb-2 font-semibold text-sm">Search Available Employees</label>
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by name or email..."
                />
              </div>
              
              <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                {loadingEmployees ? (
                  <div className="p-4 text-center text-gray-500">Loading available employees...</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    {searchTerm ? 'No employees found matching your search.' : 'No available employees found.'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredEmployees.map(employee => (
                      <label
                        key={employee.id}
                        className={`flex items-center p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                          selectedUserId === employee.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="selectedUser"
                          value={employee.id}
                          checked={selectedUserId === employee.id}
                          onChange={e => setSelectedUserId(e.target.value)}
                          className="mr-3 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {employee.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {employee.email}
                          </div>
                          {employee.defaultRole && (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              Default: {employee.defaultRole}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div>
            <label className="block mb-2 font-semibold text-sm">Project Role</label>
            <select
              className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-gray-900/80 border-gray-200 dark:border-gray-700 transition-all duration-300"
              value={role}
              onChange={e => setRole(e.target.value)}
              required
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}
          
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={inviteMutation.isPending || isInviting}>
              Send Invite
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default AddMemberModal;
