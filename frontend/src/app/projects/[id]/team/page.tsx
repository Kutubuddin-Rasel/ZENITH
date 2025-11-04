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
import { 
  TrashIcon, 
  PlusIcon, 
  UserGroupIcon, 
  EnvelopeIcon, 
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { 
  UserGroupIcon as UserGroupSolid,
  ShieldCheckIcon as ShieldCheckSolid,
  UserIcon as UserSolid,
  CogIcon as CogSolid
} from '@heroicons/react/24/solid';
import ConfirmationModal from '@/components/ConfirmationModal';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import AddMemberModal from '@/components/AddMemberModal';
import RoleBadge from '@/components/RoleBadge';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';
import { useProjectInvites } from '@/hooks/useProjectInvites';
import { useProject } from '@/hooks/useProject';
import { useRole } from '@/context/RoleContext';

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
  const { isSuperAdmin, projectRoles } = useRole();
  const { refetch: refetchAvailableEmployees } = useAvailableEmployees();

  // Add role debugging
  const currentUserRole = isSuperAdmin ? 'Super-Admin' : projectRoles[projectId];

  // Debug logging
  console.log('🔍 TeamPage Debug:', {
    currentUser,
    isSuperAdmin,
    projectRoles,
    currentUserRole,
    projectId,
    allowedRoles: ["Super-Admin", "ProjectLead"]
  });

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
      onSuccess: () => {
        showToast('Invitation resent successfully! 📧', 'success');
      },
      onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
    });
  };

  const handleRevokeInvite = (inviteId: string) => {
    revokeInvite(inviteId, {
      onSuccess: () => {
        showToast('Invitation revoked successfully! ❌', 'success');
      },
      onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
    });
  };

  const pendingInvites = invites?.filter(i => i.status === 'Pending') || [];
  const totalMembers = members?.length || 0;
  const totalInvites = pendingInvites.length;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="relative inline-block">
            <Spinner className="h-12 w-12 text-blue-600" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse" />
          </div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">Loading team members...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/50 p-8 rounded-2xl shadow-lg border border-red-200 dark:border-red-800">
            <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">Failed to load team members</h3>
            <p className="text-red-600 dark:text-red-400 text-sm">Please try refreshing the page or contact support if the issue persists.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead"]}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Enhanced Header Section */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Team Management</h1>
                <p className="text-blue-100 text-lg">
                  Manage access and permissions for <span className="font-semibold">{project?.name}</span>
                </p>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{totalMembers}</div>
                  <div className="text-blue-100 text-sm font-medium">Team Members</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{totalInvites}</div>
                  <div className="text-blue-100 text-sm font-medium">Pending Invites</div>
                </div>
                <Button 
                  onClick={() => setAddModalOpen(true)} 
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30 hover:border-white/50 font-semibold px-6 py-3 rounded-xl transition-all duration-200 flex items-center gap-2"
                >
                  <PlusIcon className="h-5 w-5" />
                  Invite Member
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Tab Navigation */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-2">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-lg font-semibold transition-all duration-200 ${
                activeTab === 'members'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <UserGroupIcon className="h-5 w-5" />
              Team Members ({totalMembers})
            </button>
            <button
              onClick={() => setActiveTab('invites')}
              className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-lg font-semibold transition-all duration-200 ${
                activeTab === 'invites'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <EnvelopeIcon className="h-5 w-5" />
              Pending Invites ({totalInvites})
            </button>
          </div>
        </div>

        {/* Content Tabs */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            {/* Enhanced Filter Section */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label htmlFor="role-filter" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Filter by role:
                  </label>
                  <select
                    id="role-filter"
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    {defaultRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {members?.filter(member => roleFilter === 'All' || member.user?.defaultRole === roleFilter).length || 0} members
                </div>
              </div>
            </div>

            {/* Enhanced Member Cards */}
            <div className="space-y-4">
              {(members?.filter(member => roleFilter === 'All' || member.user?.defaultRole === roleFilter) || []).map((member) => {
                const RoleIcon = roleIcons[member.roleName as keyof typeof roleIcons] || UserIcon;
                const isCurrentUser = member.userId === currentUser?.id;
                return (
                  <div
                    key={member.userId}
                    className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="relative">
                          <Image
                            src={member.user?.avatarUrl || `https://ui-avatars.com/api/?name=${member.user?.name || member.user?.email}&background=random&size=80`}
                            alt={member.user?.name || 'User Avatar'}
                            width={64}
                            height={64}
                            className="rounded-xl shadow-sm ring-2 ring-gray-100 dark:ring-gray-700"
                          />
                          {isCurrentUser && (
                            <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                              YOU
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                              {member.user?.name || 'Unknown User'}
                            </h3>
                            <RoleBadge role={member.roleName} />
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2 text-sm">
                            <EnvelopeIcon className="h-4 w-4" />
                            {member.user?.email}
                          </p>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                              <RoleIcon className="h-4 w-4" />
                              {member.roleName}
                            </div>
                            {member.user?.defaultRole && member.user.defaultRole !== member.roleName && (
                              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-md">
                                <ShieldCheckIcon className="h-3 w-3" />
                                Default: {member.user.defaultRole}
                              </div>
                            )}
                            {isCurrentUser && (
                              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
                                <ShieldCheckIcon className="h-4 w-4" />
                                Current User
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <select
                          value={member.roleName}
                          onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                          disabled={isUpdatingRole || isCurrentUser}
                          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {allRoles.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                        {!isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-3 w-12 h-12 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:scale-105 transition-all duration-200 shadow-sm hover:shadow-md"
                            onClick={() => openRemoveModal(member)}
                            disabled={isRemovingMember}
                            aria-label="Remove member"
                          >
                            <TrashIcon className="h-6 w-6" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'invites' && (
          <div className="space-y-6">
            {loadingInvites ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <div className="text-center">
                  <div className="relative inline-block">
                    <Spinner className="h-12 w-12 text-blue-600" />
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse" />
                  </div>
                  <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">Loading invitations...</p>
                </div>
              </div>
            ) : pendingInvites.length === 0 ? (
              <div className="flex justify-center items-center min-h-[40vh]">
                <div className="text-center max-w-md">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950/50 dark:to-gray-900/50 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
                    <EnvelopeIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">No pending invitations</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">All invitations have been responded to or expired.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingInvites.map((invite) => {
                  const RoleIcon = roleIcons[invite.role as keyof typeof roleIcons] || UserIcon;
                  return (
                    <div
                      key={invite.id}
                      className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="relative">
                            <Image
                              src={invite.invitee?.avatar || `https://ui-avatars.com/api/?name=${invite.invitee?.name || invite.invitee?.email}&background=random&size=80`}
                              alt={invite.invitee?.name || 'User Avatar'}
                              width={64}
                              height={64}
                              className="rounded-xl shadow-sm ring-2 ring-gray-100 dark:ring-gray-700"
                            />
                            <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                              PENDING
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {invite.invitee?.name || 'Unknown User'}
                              </h3>
                              <RoleBadge role={invite.role} />
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2 text-sm">
                              <EnvelopeIcon className="h-4 w-4" />
                              {invite.invitee?.email}
                            </p>
                            <div className="flex items-center gap-6">
                              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <RoleIcon className="h-4 w-4" />
                                {invite.role}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-md">
                                <ClockIcon className="h-3 w-3" />
                                Invited {new Date(invite.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-3 w-12 h-12 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:scale-105 transition-all duration-200 shadow-sm hover:shadow-md"
                            onClick={() => handleResendInvite(invite.id)}
                            aria-label="Resend invite"
                          >
                            <ArrowPathIcon className="h-6 w-6" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-3 w-12 h-12 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:scale-105 transition-all duration-200 shadow-sm hover:shadow-md"
                            onClick={() => handleRevokeInvite(invite.id)}
                            aria-label="Revoke invite"
                          >
                            <XCircleIcon className="h-6 w-6" />
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

        {/* Confirmation Modal for Member Removal */}
        <ConfirmationModal
          open={isRemoveModalOpen}
          onClose={() => {
            setRemoveModalOpen(false);
            setSelectedMember(null);
          }}
          onConfirm={handleRemoveConfirm}
          title="Remove Team Member"
          message={`Are you sure you want to remove ${selectedMember?.user?.name || selectedMember?.user?.email || 'this member'} from the project? This action cannot be undone and they will lose access to all project resources.`}
          confirmText="Remove Member"
          cancelText="Cancel"
          isConfirming={isRemovingMember}
        />
      </div>
    </ProtectedProjectRoute>
  );
} 