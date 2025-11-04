'use client';
import React from 'react';
import Button from '@/components/Button';
import Spinner from '@/components/Spinner';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';
import Input from '@/components/Input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  PencilSquareIcon, 
  TrashIcon, 
  MagnifyingGlassIcon,
  FunnelIcon,
  UserPlusIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrophyIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useToast } from '@/context/ToastContext';
import PageLayout from '@/components/PageLayout';
import Card from '@/components/Card';
import Typography from '@/components/Typography';
import Modal from '@/components/Modal';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  defaultRole: string;
  isActive: boolean;
  projects: Project[];
}

interface Project {
  projectId: string;
  projectName: string;
  projectKey: string;
  roleName: string;
}

const userSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  defaultRole: z.string().min(2, 'Role is required'),
});

const ROLES = ['Developer', 'QA', 'Designer', 'ProjectLead', 'Viewer'];

const editUserSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  defaultRole: z.string().min(2, 'Role is required'),
});

const getRoleColor = (role: string) => {
  switch (role) {
    case 'ProjectLead': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'Developer': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'QA': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'Designer': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'Viewer': return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200';
    default: return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200';
  }
};

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'ProjectLead': return '👑';
    case 'Developer': return '💻';
    case 'QA': return '🔍';
    case 'Designer': return '🎨';
    case 'Viewer': return '👁️';
    default: return '👤';
  }
};

const getRoleDescription = (role: string) => {
  switch (role) {
    case 'ProjectLead': return 'Leads projects and manages team';
    case 'Developer': return 'Builds and maintains features';
    case 'QA': return 'Ensures quality and tests thoroughly';
    case 'Designer': return 'Creates beautiful user experiences';
    case 'Viewer': return 'Views and tracks progress';
    default: return 'Team member';
  }
};

const ManageEmployeesPage: React.FC = () => {
  const { data: users, isLoading, isError, refetch } = useQuery<User[]>({
    queryKey: ['users-with-projects'],
    queryFn: () => apiFetch('/users/project-memberships'),
  });

  const [showForm, setShowForm] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [editUser, setEditUser] = React.useState<User | null>(null);
  const [deleteUser, setDeleteUser] = React.useState<User | null>(null);
  const [activatingUserId, setActivatingUserId] = React.useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = React.useState<string | null>(null);
  const { showToast } = useToast();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(userSchema),
  });

  const { register: editRegister, handleSubmit: handleEditSubmit, reset: resetEdit, formState: { errors: editErrors, isSubmitting: isEditSubmitting } } = useForm({
    resolver: zodResolver(editUserSchema),
  });

  const filteredUsers = (users || []).filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase()) || user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter ? user.defaultRole === roleFilter : true;
    const matchesStatus = statusFilter ? (statusFilter === 'active' ? user.isActive : !user.isActive) : true;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const onSubmit = async (data: z.infer<typeof userSchema>) => {
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      reset();
      setShowForm(false);
      refetch();
      showToast('User created successfully!', 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user';
      showToast(errorMessage, 'error');
    }
  };

  const onEditSubmit = async (data: z.infer<typeof editUserSchema>) => {
    if (!editUser) return;
    try {
      await apiFetch(`/users/${editUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      setEditUser(null);
      refetch();
      showToast('User updated successfully!', 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update user';
      showToast(errorMessage, 'error');
    }
  };

  const handleToggleActive = async (user: User) => {
    setActivatingUserId(user.id);
    try {
      await apiFetch(`/users/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      refetch();
      showToast(`User ${user.isActive ? 'deactivated' : 'activated'} successfully!`, 'success');
      } catch {
      showToast('Failed to update user status', 'error');
    } finally {
      setActivatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeletingUserId(deleteUser.id);
    try {
      await apiFetch(`/users/${deleteUser.id}`, { method: 'DELETE' });
      setDeleteUser(null);
      refetch();
      showToast('User deleted successfully!', 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete user';
      showToast(errorMessage, 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  React.useEffect(() => {
    if (editUser) {
      resetEdit({ name: editUser.name, defaultRole: editUser.defaultRole || '' });
    }
  }, [editUser, resetEdit]);

  // Stats data
  const totalMembers = users?.length || 0;
  const activeMembers = users?.filter(u => u.isActive).length || 0;
  const projectLeads = users?.filter(u => u.defaultRole === 'ProjectLead').length || 0;

  // Action buttons for header
  const actionButtons = (
    <Button onClick={() => setShowForm(true)}>
      <UserPlusIcon className="h-4 w-4 mr-2" />
      Add Member
    </Button>
  );

  const renderStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <Card variant="elevated" padding="lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
            <UserGroupIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <Typography variant="h3" className="!text-2xl">
              {totalMembers}
            </Typography>
            <Typography variant="body-sm" color="muted">
              Total Members
            </Typography>
          </div>
        </div>
      </Card>

      <Card variant="elevated" padding="lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-success-100 dark:bg-success-900 rounded-lg flex items-center justify-center">
            <CheckCircleIcon className="h-6 w-6 text-success-600 dark:text-success-400" />
          </div>
          <div>
            <Typography variant="h3" className="!text-2xl">
              {activeMembers}
            </Typography>
            <Typography variant="body-sm" color="muted">
              Active Members
            </Typography>
          </div>
        </div>
      </Card>

      <Card variant="elevated" padding="lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
            <TrophyIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <Typography variant="h3" className="!text-2xl">
              {projectLeads}
            </Typography>
            <Typography variant="body-sm" color="muted">
              Project Leads
            </Typography>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderFilters = () => (
    <Card variant="elevated" padding="lg" className="mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="pl-10 pr-8 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-medium transition-all"
            >
              <option value="">All Roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-medium transition-all"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </Card>
  );

  const renderUserCard = (user: User) => (
    <Card key={user.id} variant="elevated" padding="lg" className="h-full">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                <Typography variant="h5" className="text-primary-600 dark:text-primary-400">
                  {user.name.charAt(0).toUpperCase()}
                </Typography>
              </div>
              {user.isActive && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success-500 rounded-full border-2 border-white dark:border-neutral-900" />
              )}
            </div>
            <div>
              <Typography variant="h5" className="mb-1">
                {user.name}
              </Typography>
              <Typography variant="body-sm" color="muted">
                {user.email}
              </Typography>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user.isActive ? (
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200">
                <div className="w-2 h-2 bg-success-500 rounded-full mr-1" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
                <div className="w-2 h-2 bg-neutral-400 rounded-full mr-1" />
                Inactive
              </span>
            )}
          </div>
        </div>

        {/* Role */}
        {user.defaultRole && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-full ${getRoleColor(user.defaultRole)}`}>
                <span className="mr-1">{getRoleIcon(user.defaultRole)}</span>
                {user.defaultRole}
              </span>
            </div>
            <Typography variant="body-xs" color="muted" className="italic">
              {getRoleDescription(user.defaultRole)}
            </Typography>
          </div>
        )}

        {/* Projects */}
        <div className="mb-4 flex-1">
          <Typography variant="label" className="mb-2 flex items-center gap-1">
            <SparklesIcon className="h-4 w-4" />
            Projects ({user.projects?.length || 0})
          </Typography>
          <div className="flex flex-wrap gap-2">
            {user.projects && user.projects.length > 0 ? (
              user.projects.map((pm: Project) => (
                <a
                  key={pm.projectId}
                  href={`/projects/${pm.projectId}`}
                  className="inline-flex items-center px-2 py-1 rounded-md bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200 font-medium hover:bg-primary-200 dark:hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all text-xs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {pm.projectName || pm.projectKey}
                  {pm.roleName && (
                    <span className="ml-1 text-primary-600 dark:text-primary-400 font-semibold">
                      ({pm.roleName})
                    </span>
                  )}
                </a>
              ))
            ) : (
              <Typography variant="body-xs" color="muted" className="italic">
                No projects assigned
              </Typography>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button 
            variant="secondary"
            size="sm"
            onClick={() => setEditUser(user)} 
            className="flex-1"
          >
            <PencilSquareIcon className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button
            variant={user.isActive ? "warning" : "success"}
            size="sm"
            onClick={() => handleToggleActive(user)}
            disabled={!!activatingUserId}
            className="flex-1"
          >
            {activatingUserId === user.id ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                {user.isActive ? <XCircleIcon className="h-4 w-4 mr-1" /> : <CheckCircleIcon className="h-4 w-4 mr-1" />}
                {user.isActive ? 'Deactivate' : 'Activate'}
              </>
            )}
          </Button>
          <Button 
            variant="danger"
            size="sm"
            onClick={() => setDeleteUser(user)} 
            className="flex-1"
          >
            <TrashIcon className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <Spinner className="h-8 w-8 mx-auto mb-4" />
            <Typography variant="body-sm" color="muted">
              Loading team members...
            </Typography>
          </div>
        </div>
      );
    }

    if (isError) {
      return (
        <Card variant="outlined" className="text-center p-8">
          <XCircleIcon className="h-16 w-16 text-error-500 mx-auto mb-4" />
          <Typography variant="h3" className="mb-2">
            Failed to load team members
          </Typography>
          <Typography variant="body" color="muted">
            Please try refreshing the page.
          </Typography>
        </Card>
      );
    }

    if (!filteredUsers || filteredUsers.length === 0) {
      return (
        <Card variant="outlined" className="text-center p-12">
          <UserGroupIcon className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
          <Typography variant="h3" className="mb-2">
            No team members found
          </Typography>
          <Typography variant="body" color="muted">
            Try adjusting your search or filters.
          </Typography>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredUsers.map((user) => renderUserCard(user))}
      </div>
    );
  };

  return (
    <PageLayout
      title="Team Management"
      subtitle="Manage your team members and their roles"
      actions={actionButtons}
    >
      {renderStats()}
      {renderFilters()}
      {renderContent()}

      {/* Add New User Form */}
      {showForm && (
        <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="Add New Team Member">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Typography variant="label" className="block mb-2">
                  Full Name
                </Typography>
                <Input {...register('name')} placeholder="Enter full name" />
                {errors.name && (
                  <Typography variant="body-xs" color="error" className="mt-1">
                    {errors.name.message}
                  </Typography>
                )}
              </div>
              <div>
                <Typography variant="label" className="block mb-2">
                  Email Address
                </Typography>
                <Input type="email" {...register('email')} placeholder="Enter email address" />
                {errors.email && (
                  <Typography variant="body-xs" color="error" className="mt-1">
                    {errors.email.message}
                  </Typography>
                )}
              </div>
            </div>
            
            <div>
              <Typography variant="label" className="block mb-2">
                Password
              </Typography>
              <Input type="password" {...register('password')} placeholder="Enter password" />
              {errors.password && (
                <Typography variant="body-xs" color="error" className="mt-1">
                  {errors.password.message}
                </Typography>
              )}
            </div>
            
            <div>
              <Typography variant="label" className="block mb-2">
                Default Role
              </Typography>
              <select 
                {...register('defaultRole')} 
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-medium transition-all"
              >
                <option value="">Select a role</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              {errors.defaultRole && (
                <Typography variant="body-xs" color="error" className="mt-1">
                  {errors.defaultRole.message}
                </Typography>
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={() => { setShowForm(false); reset(); }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting ? <Spinner className="h-4 w-4" /> : (
                  <>
                    <UserPlusIcon className="h-4 w-4 mr-2" />
                    Create Member
                  </>
                )}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Team Member">
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-6">
            <div>
              <Typography variant="label" className="block mb-2">
                Full Name
              </Typography>
              <Input {...editRegister('name')} placeholder="Enter full name" />
              {editErrors.name && (
                <Typography variant="body-xs" color="error" className="mt-1">
                  {editErrors.name.message}
                </Typography>
              )}
            </div>
            
            <div>
              <Typography variant="label" className="block mb-2">
                Email Address
              </Typography>
              <Input value={editUser.email} readOnly className="opacity-70 cursor-not-allowed" />
            </div>
            
            <div>
              <Typography variant="label" className="block mb-2">
                Default Role
              </Typography>
              <select 
                {...editRegister('defaultRole')} 
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-medium transition-all"
              >
                <option value="">Select a role</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              {editErrors.defaultRole && (
                <Typography variant="body-xs" color="error" className="mt-1">
                  {editErrors.defaultRole.message}
                </Typography>
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setEditUser(null)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isEditSubmitting}
              >
                {isEditSubmitting ? <Spinner className="h-4 w-4" /> : (
                  <>
                    <PencilSquareIcon className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete User Confirmation */}
      {deleteUser && (
        <Modal open={!!deleteUser} onClose={() => setDeleteUser(null)} title="Delete Team Member">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-error-100 dark:bg-error-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrashIcon className="h-8 w-8 text-error-500" />
            </div>
            <Typography variant="h4" className="mb-2">
              Are you sure you want to delete {deleteUser.name}?
            </Typography>
            <Typography variant="body" color="muted">
              This action cannot be undone and will permanently remove this team member from the system.
            </Typography>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteUser(null)} disabled={!!deletingUserId}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDeleteUser} 
              disabled={!!deletingUserId}
            >
              {deletingUserId ? <Spinner className="h-4 w-4" /> : (
                <>
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete Member
                </>
              )}
            </Button>
          </div>
        </Modal>
      )}
    </PageLayout>
  );
};

export default ManageEmployeesPage; 