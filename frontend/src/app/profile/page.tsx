"use client";
import React, { useState } from "react";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Input from "../../components/Input";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { UserIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon, ShieldCheckIcon, BellIcon, BriefcaseIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/fetcher';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const { showToast } = useToast();
  const [pwLoading, setPwLoading] = useState(false);
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  const handleSave = () => {
    // TODO: Implement profile update functionality
    setIsEditing(false);
  };

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (!pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmNewPassword) {
      setPwError('All fields are required.');
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmNewPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    if (!user) return;
    setPwLoading(true);
    try {
      await apiFetch(`/users/${user.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify(pwForm),
        headers: { 'Content-Type': 'application/json' },
      });
      setPwSuccess(true);
      setPwForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      showToast('Password changed successfully!', 'success');
    } catch (err: any) {
      setPwError(err?.message || 'Failed to change password.');
      showToast(err?.message || 'Failed to change password.', 'error');
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-200 dark:to-white bg-clip-text text-transparent">
          Profile Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2 text-lg">
          Manage your account and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                Personal Information
              </h2>
              <Button 
                size="sm" 
                variant="secondary" 
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2"
              >
                <Cog6ToothIcon className="h-4 w-4" />
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
            </div>

            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                {user?.name ? (
                  <span className="text-white font-bold text-2xl">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserIcon className="h-10 w-10 text-white" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                  {user?.name || 'User'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {user?.email || 'No email provided'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <ShieldCheckIcon className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                    Account Verified
                  </span>
                </div>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <Input
                  label="Full Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your full name"
                />
                <Input
                  label="Email Address"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter your email"
                  type="email"
                />
                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSave} className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white">
                    Save Changes
                  </Button>
                  <Button variant="secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Full Name
                  </label>
                  <p className="text-gray-900 dark:text-white">{user?.name || 'Not provided'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address
                  </label>
                  <p className="text-gray-900 dark:text-white">{user?.email || 'Not provided'}</p>
                </div>
              </div>
            )}
          </Card>

          {/* Change Password Card */}
          <Card className="p-8">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-6">
              Change Password
            </h2>
            <form className="space-y-4" onSubmit={handleChangePassword}>
              <Input
                label="Current Password"
                type="password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                placeholder="Enter your current password"
                required
              />
              <Input
                label="New Password"
                type="password"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="Enter a new password"
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={pwForm.confirmNewPassword}
                onChange={e => setPwForm(f => ({ ...f, confirmNewPassword: e.target.value }))}
                placeholder="Re-enter new password"
                required
              />
              {pwError && <div className="text-red-600 dark:text-red-400 font-medium">{pwError}</div>}
              {pwSuccess && <div className="text-green-600 dark:text-green-400 font-medium">Password changed successfully!</div>}
              <div className="pt-2">
                <Button type="submit" loading={pwLoading} className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white">
                  Change Password
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Quick Actions
            </h3>
            <div className="space-y-3">
              <Link href="/projects">
                <Button variant="secondary" className="w-full justify-start">
                  <BriefcaseIcon className="h-4 w-4 mr-2" />
                  My Projects
                </Button>
              </Link>
              <Link href="/notifications">
                <Button variant="secondary" className="w-full justify-start">
                  <BellIcon className="h-4 w-4 mr-2" />
                  Notifications
                </Button>
              </Link>
            </div>
          </Card>

          {/* Account Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Account
            </h3>
            <div className="space-y-3">
              <Button 
                variant="secondary" 
                className="w-full justify-start text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                onClick={handleLogout}
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </Card>

          {/* Account Info */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Account Info
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Member since:</span>
                <span className="text-gray-900 dark:text-white">Today</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Status:</span>
                <span className="text-green-600 dark:text-green-400 font-medium">Active</span>
              </div>
            </div>
      </Card>
        </div>
      </div>
    </div>
  );
} 