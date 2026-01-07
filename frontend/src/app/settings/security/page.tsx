"use client";
import React from 'react';
import { SettingsHeader, SettingsCard } from '@/components/settings-ui';
import TwoFactorAuthManagement from '@/components/TwoFactorAuthManagement';
import SessionManagement from '@/components/SessionManagement';
import Button from '@/components/Button';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
    ShieldCheckIcon,
    KeyIcon,
    DevicePhoneMobileIcon,
    ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline';

/**
 * User Security Settings Page
 * Path: /settings/security
 * 
 * This is the USER's security hub - separate from Project Policies
 * Contains: 2FA Management, Active Sessions, Password Change
 */
export default function SecuritySettingsPage() {
    useAuth(); // Keep for auth context, but remove unused destructuring
    const router = useRouter();

    const handleSessionTerminated = () => {
        // Optional: Show notification or refresh data
        console.log('Session terminated');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <SettingsHeader
                title="Security"
                description="Manage your account security, authentication, and active sessions."
            />

            {/* Two-Factor Authentication Section */}
            {/* TwoFactorAuthManagement now renders a SettingsCard internally */}
            <TwoFactorAuthManagement />

            {/* Active Sessions Section */}
            <SettingsCard
                title="Active Sessions"
                description="View and manage devices where you're currently signed in. If you see a session you don't recognize, revoke it immediately."
            >
                <div className="space-y-6">
                    <SessionManagement onSessionTerminated={handleSessionTerminated} />
                </div>
            </SettingsCard>

            {/* Password Section */}
            <SettingsCard
                title="Password"
                description="We recommend changing your password regularly and using a unique password that you don't use for other accounts."
                footer={
                    <Button
                        variant="secondary"
                        onClick={() => {
                            // Navigate to profile settings where the password form lives now, 
                            // or keep original behavior if separate page exists.
                            // Original was: window.location.href = `/users/${user?.id || 'me'}/change-password`
                            // Given we added inline password change to Profile, maybe we guide them there?
                            // But let's stick to a safe redirect or just link to Profile.
                            router.push('/settings/profile');
                        }}
                    >
                        <KeyIcon className="h-5 w-5 mr-2" />
                        Update Password in Profile
                    </Button>
                }
            >
                <div className="flex items-center gap-3 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <KeyIcon className="h-5 w-5 text-neutral-500" />
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Password management has been moved to the Profile settings page for easier access.
                    </p>
                </div>
            </SettingsCard>

            {/* Security Tips */}
            <SettingsCard
                title="Security Recommendations"
                description="Best practices for keeping your account safe."
                className="!bg-blue-50/50 dark:!bg-blue-900/10 !border-blue-200 dark:!border-blue-800"
            >
                <ul className="space-y-3 text-sm text-blue-900 dark:text-blue-200">
                    <li className="flex items-start gap-3">
                        <ShieldCheckIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <span>Enable Two-Factor Authentication for maximum account protection</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <KeyIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <span>Use a strong, unique password with at least 12 characters</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <DevicePhoneMobileIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <span>Review your active sessions regularly and revoke any you don&apos;t recognize</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <ArrowTopRightOnSquareIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <span>Keep your authenticator app and backup codes in a secure location</span>
                    </li>
                </ul>
            </SettingsCard>
        </div>
    );
}
