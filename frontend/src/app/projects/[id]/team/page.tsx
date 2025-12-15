"use client";
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import {
  useProjectMembers,
  useUpdateProjectMemberRole,
  useRemoveProjectMember,
  ProjectMember,
} from '@/hooks/useProject';
import { useAvailableEmployees } from '@/hooks/useAvailableEmployees';
import Spinner from '@/components/Spinner';
import Button from '@/components/Button';
import Typography from '@/components/Typography';
import {
  TrashIcon,
  PlusIcon,
  UserGroupIcon,
  EnvelopeIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import {
  ShieldCheckIcon as ShieldCheckSolid,
  UserIcon as UserSolid,
  CogIcon as CogSolid,
  UserGroupIcon as UserGroupSolid,
} from '@heroicons/react/24/solid';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import AddMemberModal from '@/components/AddMemberModal';
import RoleBadge from '@/components/RoleBadge';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';
import { useProjectInvites } from '@/hooks/useProjectInvites';
import { useProject } from '@/hooks/useProject';


const allRoles = ['ProjectLead', 'Developer', 'QA', 'Viewer'];
const defaultRoles = ['All', 'ProjectLead', 'Developer', 'QA', 'Designer', 'Viewer'];

const roleIcons = {
  'Super-Admin': UserSolid,
  'ProjectLead': ShieldCheckSolid,
  'Developer': UserSolid,
  'QA': CogSolid,
  'Viewer': UserGroupSolid,
};

export default function TeamPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { user: currentUser } = useAuth();
  const { project } = useProject(projectId);
  const { data: members, isLoading, isError } = useProjectMembers(projectId);
  const { invites, isLoading: loadingInvites, resendInvite, revokeInvite } = useProjectInvites();
  const { showToast } = useToast();

  const { refetch: refetchAvailableEmployees } = useAvailableEmployees();



  const [isRemoveModalOpen, setRemoveModalOpen] = useState(false);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ProjectMember | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'invites'>('members');
  const [roleFilter, setRoleFilter] = useState<string>('All');

  const { mutate: updateRole, isPending: isUpdatingRole } = useUpdateProjectMemberRole(projectId);
  const { mutate: removeMember, isPending: isRemovingMember } = useRemoveProjectMember(projectId);

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRole({ userId, roleName: newRole }, {
      onSuccess: () => showToast('Member role updated successfully! ✨', 'success'),
      onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
    });
  };

  const openRemoveModal = (member: ProjectMember) => {
    setSelectedMember(member);
    setRemoveModalOpen(true);
  };

  const handleRemoveConfirm = () => {
    if (selectedMember) {
      removeMember(selectedMember.userId, {
        onSuccess: () => {
          showToast('Member removed from project successfully! 👋', 'success');
          setRemoveModalOpen(false);
          setSelectedMember(null);
          refetchAvailableEmployees();
        },
        onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
      });
    }
  };

  const handleResendInvite = (inviteId: string) => {
    resendInvite(inviteId, {
      onSuccess: () => showToast('Invitation resent successfully! 📧', 'success'),
      onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
    });
  };

  const handleRevokeInvite = (inviteId: string) => {
    revokeInvite(inviteId, {
      onSuccess: () => showToast('Invitation revoked successfully! ❌', 'success'),
      onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
    });
  };

  const pendingInvites = invites?.filter(i => i.status === 'Pending') || [];
  const totalMembers = members?.length || 0;
  const totalInvites = pendingInvites.length;

  const filteredMembers = members?.filter(member =>
    roleFilter === 'All' || member.roleName === roleFilter
  ) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="flex justify-center py-16">
          <div className="text-center">
            <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
              Loading team members...
            </Typography>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
        <div className="text-center py-16">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <Typography variant="h3" className="text-red-600 dark:text-red-400 mb-2">
            Failed to load team members
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Please try refreshing the page
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead"]}>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
        {/* Header - Matching Issues/Sprints style */}
        <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-6">
              <div className="flex items-center gap-4">
                <UserGroupIcon className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
                <div>
                  <Typography variant="h1" className="text-neutral-900 dark:text-white">
                    Team
                  </Typography>
                  <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mt-1">
                    {project?.name} • {totalMembers} members • {totalInvites} pending
                  </Typography>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                Invite Member
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('members')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'members'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'
                  }`}
              >
                <span className="flex items-center gap-2">
                  <UserGroupIcon className="h-5 w-5" />
                  Team Members ({totalMembers})
                </span>
              </button>
              <button
                onClick={() => setActiveTab('invites')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'invites'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'
                  }`}
              >
                <span className="flex items-center gap-2">
                  <EnvelopeIcon className="h-5 w-5" />
                  Pending Invites ({totalInvites})
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'members' && (
            <div className="space-y-6">
              {/* Filter Bar */}
              <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label htmlFor="role-filter" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Filter by role:
                    </label>
                    <select
                      id="role-filter"
                      value={roleFilter}
                      onChange={e => setRoleFilter(e.target.value)}
                      className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      {defaultRoles.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400">
                    {filteredMembers.length} members
                  </Typography>
                </div>
              </div>

              {/* Members List */}
              {filteredMembers.length === 0 ? (
                <div className="text-center py-16">
                  <UserGroupIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <Typography variant="h3" className="text-neutral-700 dark:text-neutral-300 mb-2">
                    No members found
                  </Typography>
                  <Typography variant="body" className="text-neutral-500 dark:text-neutral-400">
                    {roleFilter !== 'All' ? 'Try adjusting your filter' : 'Invite members to get started'}
                  </Typography>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMembers.map((member) => {
                    const RoleIcon = roleIcons[member.roleName as keyof typeof roleIcons] || UserIcon;
                    const isCurrentUser = member.userId === currentUser?.id;
                    return (
                      <div
                        key={member.userId}
                        className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="relative">
                              <Image
                                src={member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.user?.name || member.user?.email || 'U')}&background=random&size=48`}
                                alt={member.user?.name || 'User Avatar'}
                                width={48}
                                height={48}
                                unoptimized
                                className="rounded-full"
                              />
                              {isCurrentUser && (
                                <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                  YOU
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div>
                              <div className="flex items-center gap-2">
                                <Typography variant="body" className="font-semibold text-neutral-900 dark:text-white">
                                  {member.user?.name || 'Unknown User'}
                                </Typography>
                                <RoleBadge role={member.roleName} />
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                                  <EnvelopeIcon className="h-3.5 w-3.5" />
                                  {member.user?.email}
                                </Typography>
                                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                                  <RoleIcon className="h-3.5 w-3.5" />
                                  {member.roleName}
                                </Typography>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-3">
                            <select
                              value={member.roleName}
                              onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                              disabled={isUpdatingRole || isCurrentUser}
                              className="px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {allRoles.map(role => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                            {!isCurrentUser && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openRemoveModal(member)}
                                disabled={isRemovingMember}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'invites' && (
            <div className="space-y-6">
              {loadingInvites ? (
                <div className="flex justify-center py-16">
                  <div className="text-center">
                    <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
                    <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                      Loading invitations...
                    </Typography>
                  </div>
                </div>
              ) : pendingInvites.length === 0 ? (
                <div className="text-center py-16">
                  <EnvelopeIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <Typography variant="h3" className="text-neutral-700 dark:text-neutral-300 mb-2">
                    No pending invitations
                  </Typography>
                  <Typography variant="body" className="text-neutral-500 dark:text-neutral-400">
                    All invitations have been responded to or expired.
                  </Typography>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingInvites.map((invite) => {
                    return (
                      <div
                        key={invite.id}
                        className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Avatar */}
                            <div className="relative">
                              <Image
                                src={invite.invitee?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(invite.invitee?.name || invite.invitee?.email || 'U')}&background=random&size=48`}
                                alt={invite.invitee?.name || 'User Avatar'}
                                width={48}
                                height={48}
                                unoptimized
                                className="rounded-full"
                              />
                              <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                PENDING
                              </div>
                            </div>

                            {/* Info */}
                            <div>
                              <div className="flex items-center gap-2">
                                <Typography variant="body" className="font-semibold text-neutral-900 dark:text-white">
                                  {invite.invitee?.name || 'Unknown User'}
                                </Typography>
                                <RoleBadge role={invite.role} />
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                                  <EnvelopeIcon className="h-3.5 w-3.5" />
                                  {invite.invitee?.email}
                                </Typography>
                                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                                  <ClockIcon className="h-3.5 w-3.5" />
                                  Invited {new Date(invite.createdAt).toLocaleDateString()}
                                </Typography>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleResendInvite(invite.id)}
                              className="flex items-center gap-1"
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                              Resend
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRevokeInvite(invite.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <XCircleIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <AddMemberModal
          open={isAddModalOpen}
          onClose={() => setAddModalOpen(false)}
          onInviteSent={() => {
            setAddModalOpen(false);
            showToast('Invitation sent successfully! 📧', 'success');
          }}
          projectId={projectId}
          isInviting={false}
        />

        <ConfirmationModal
          isOpen={isRemoveModalOpen}
          onClose={() => {
            setRemoveModalOpen(false);
            setSelectedMember(null);
          }}
          onConfirm={handleRemoveConfirm}
          title="Remove Team Member"
          message={`Are you sure you want to remove ${selectedMember?.user?.name || selectedMember?.user?.email || 'this member'} from the project? This action cannot be undone.`}
          confirmText="Remove Member"
          cancelText="Cancel"
          isLoading={isRemovingMember}
        />
      </div>
    </ProtectedProjectRoute>
  );
}