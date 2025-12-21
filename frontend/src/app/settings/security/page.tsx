"use client";
import React from 'react';
import Typography from '@/components/Typography';
import TwoFactorAuthManagement from '@/components/TwoFactorAuthManagement';
import SessionManagement from '@/components/SessionManagement';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { ShieldCheckIcon, KeyIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';

/**
 * User Security Settings Page
 * Path: /settings/security
 * 
 * This is the USER's security hub - separate from Project Policies
 * Contains: 2FA Management, Active Sessions, Password Change
 */
export default function SecuritySettingsPage() {
    const { user } = useAuth();

    const handleSessionTerminated = () => {
        // Optional: Show notification or refresh data
        console.log('Session terminated');
    };

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div>
                <Typography variant="h1" className="mb-2">
                    Security Settings
                </Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                    Manage your account security, authentication, and active sessions
                </Typography>
            </div>

            {/* Two-Factor Authentication Section */}
            <section>
                <TwoFactorAuthManagement />
            </section>

            {/* Active Sessions Section */}
            <section>
                <Card className="p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <DevicePhoneMobileIcon className="h-6 w-6 text-blue-600" />
                        <Typography variant="h3">Active Sessions</Typography>
                    </div>
                    <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-6">
                        View and manage devices where you&apos;re currently signed in. If you see a session you don&apos;t recognize, revoke it immediately.
                    </Typography>
                    <SessionManagement onSessionTerminated={handleSessionTerminated} />
                </Card>
            </section>

            {/* Password Section */}
            <section>
                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <KeyIcon className="h-6 w-6 text-blue-600" />
                            <Typography variant="h3">Password</Typography>
                        </div>
                    </div>
                    <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-4">
                        We recommend changing your password regularly and using a unique password that you don&apos;t use for other accounts.
                    </Typography>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                // Navigate to password change or open modal
                                window.location.href = `/users/${user?.id || 'me'}/change-password`;
                            }}
                        >
                            <KeyIcon className="h-5 w-5 mr-2" />
                            Change Password
                        </Button>
                    </div>
                </Card>
            </section>

            {/* Security Tips */}
            <section>
                <Card className="p-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <div className="flex items-center space-x-3 mb-4">
                        <ShieldCheckIcon className="h-6 w-6 text-blue-600" />
                        <Typography variant="h3" className="text-blue-900 dark:text-blue-100">
                            Security Recommendations
                        </Typography>
                    </div>
                    <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold mt-0.5">•</span>
                            <span>Enable Two-Factor Authentication for maximum account protection</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold mt-0.5">•</span>
                            <span>Use a strong, unique password with at least 12 characters</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold mt-0.5">•</span>
                            <span>Review your active sessions regularly and revoke any you don&apos;t recognize</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold mt-0.5">•</span>
                            <span>Keep your authenticator app and backup codes in a secure location</span>
                        </li>
                    </ul>
                </Card>
            </section>
        </div>
    );
}
