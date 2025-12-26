"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/fetcher';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { SettingsHeader, SettingsCard } from '@/components/settings-ui';
import {
    UserCircleIcon,
    CameraIcon,
    KeyIcon,
    ShieldCheckIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline';

const API_URL = 'http://localhost:3000';

export default function ProfilePage() {
    const { user, refreshUserData, logout } = useAuth();
    const { showToast } = useToast();

    // -- State: Profile Form --
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [isProfileSaving, setIsProfileSaving] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

    // -- State: Password Form --
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordSaving, setIsPasswordSaving] = useState(false);

    // -- State: Delete Account --
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');

    // -- Refs --
    const fileInputRef = useRef<HTMLInputElement>(null);

    // -- Effects --
    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setEmail(user.email || '');
        }
    }, [user]);

    // -- Handlers --
    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (!name.trim()) {
            showToast('Name cannot be empty', 'error');
            return;
        }

        try {
            setIsProfileSaving(true);
            await apiFetch(`/users/${user.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ name }),
            });
            await refreshUserData();
            showToast('Profile updated successfully', 'success');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update profile';
            showToast(message, 'error');
        } finally {
            setIsProfileSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            setIsPasswordSaving(true);
            await apiFetch(`/users/${user.id}/password`, {
                method: 'PATCH',
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmNewPassword: confirmPassword,
                }),
            });
            showToast('Password changed successfully', 'success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setShowPasswordForm(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to change password';
            showToast(message, 'error');
        } finally {
            setIsPasswordSaving(false);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
            showToast('Please upload a JPG or PNG image', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('File size must be less than 5MB', 'error');
            return;
        }

        try {
            setIsUploadingAvatar(true);
            const formData = new FormData();
            formData.append('avatar', file);

            const response = await fetch(`${API_URL}/users/me/avatar`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to upload avatar');
            }

            await refreshUserData();
            showToast('Avatar updated successfully', 'success');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to upload avatar';
            showToast(message, 'error');
        } finally {
            setIsUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteAccount = async () => {
        if (!user || deleteConfirmation !== 'DELETE') return;

        try {
            setIsDeleting(true);
            await apiFetch(`/users/${user.id}`, { method: 'DELETE' });
            showToast('Account deleted successfully', 'success');
            logout();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to delete account';
            showToast(message, 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // -- Computed --
    const isProfileDirty = user && name !== user.name;

    if (!user) {
        return (
            <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <SettingsHeader
                title="Profile"
                description="Manage your Zenith profile and account settings."
            />

            {/* Profile Information */}
            <SettingsCard
                title="Profile Information"
                description="Update your photo and personal details."
                footer={
                    <Button
                        type="submit"
                        form="profile-form"
                        disabled={!isProfileDirty || isProfileSaving}
                        loading={isProfileSaving}
                    >
                        Save Changes
                    </Button>
                }
            >
                <form id="profile-form" onSubmit={handleProfileSubmit} className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                        <div className="flex-shrink-0">
                            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                                Profile Photo
                            </label>
                            <div className="flex items-center gap-6">
                                <div
                                    className="relative group cursor-pointer flex-shrink-0"
                                    onClick={handleAvatarClick}
                                >
                                    <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 group-hover:border-primary-500 transition-all duration-200 shadow-sm">
                                        {user.avatarUrl ? (
                                            <img
                                                src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `${API_URL}${user.avatarUrl}`}
                                                alt={user.name || 'Avatar'}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <UserCircleIcon className="w-14 h-14 text-neutral-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <CameraIcon className="w-6 h-6 text-white" />
                                    </div>
                                    {isUploadingAvatar && (
                                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleAvatarClick}
                                        disabled={isUploadingAvatar}
                                    >
                                        Change Photo
                                    </Button>
                                    <p className="text-xs text-neutral-500 mt-2">
                                        JPG or PNG. Max 5MB.
                                    </p>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png, image/jpeg"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>
                        </div>

                        <div className="flex-1 space-y-4">
                            <Input
                                label="Full Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe"
                            />
                            <Input
                                label="Email Address"
                                value={email}
                                disabled
                                helperText="Email address cannot be changed"
                            />
                        </div>
                    </div>
                </form>
            </SettingsCard>

            {/* Account Status (Moved from sidebar) */}
            <SettingsCard
                title="Account Status"
                description="Overview of your current role and account standing."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <ShieldCheckIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Status</p>
                            <p className="text-sm font-semibold text-green-600 dark:text-green-400">Active</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                        <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Role</p>
                            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                                {user.isSuperAdmin ? 'Super Admin' : 'Member'}
                            </p>
                        </div>
                    </div>
                </div>
            </SettingsCard>

            {/* Security */}
            <SettingsCard
                title="Password"
                description="Manage your password security."
            >
                {!showPasswordForm ? (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                                <KeyIcon className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-neutral-900 dark:text-white">
                                    Last changed
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Password hidden for security
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => setShowPasswordForm(true)}
                        >
                            Change Password
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
                        <Input
                            label="Current Password"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                        <Input
                            label="New Password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                        <Input
                            label="Confirm New Password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                        />

                        <div className="flex items-center gap-3 pt-2">
                            <Button
                                type="submit"
                                disabled={!currentPassword || !newPassword || !confirmPassword || isPasswordSaving}
                                loading={isPasswordSaving}
                            >
                                Update Password
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setShowPasswordForm(false);
                                    setCurrentPassword('');
                                    setNewPassword('');
                                    setConfirmPassword('');
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}
            </SettingsCard>

            {/* Danger Zone */}
            <SettingsCard
                title="Danger Zone"
                description="Irreversible and destructive actions."
                variant="danger"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="font-medium text-neutral-900 dark:text-white">
                            Delete Account
                        </p>
                        <p className="text-sm text-neutral-500 mt-1">
                            Permanently delete your account and all associated data.
                        </p>
                    </div>
                    {!showDeleteConfirm ? (
                        <Button
                            variant="danger"
                            onClick={() => setShowDeleteConfirm(true)}
                        >
                            Delete Account
                        </Button>
                    ) : (
                        <div className="space-y-3 w-full sm:w-auto">
                            <div className="flex flex-col gap-2">
                                <Input
                                    placeholder="Type DELETE"
                                    value={deleteConfirmation}
                                    onChange={(e) => setDeleteConfirmation(e.target.value.toUpperCase())}
                                    className="w-full sm:w-40"
                                />
                                <div className="flex gap-2">
                                    <Button
                                        variant="danger"
                                        disabled={deleteConfirmation !== 'DELETE' || isDeleting}
                                        loading={isDeleting}
                                        onClick={handleDeleteAccount}
                                        fullWidth
                                    >
                                        Confirm
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setShowDeleteConfirm(false);
                                            setDeleteConfirmation('');
                                        }}
                                        fullWidth
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </SettingsCard>
        </div>
    );
}
