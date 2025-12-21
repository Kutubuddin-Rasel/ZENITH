"use client";
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Typography from '@/components/Typography';
import { ShieldExclamationIcon, LockClosedIcon, KeyIcon } from '@heroicons/react/24/outline';

interface ProjectErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

/**
 * Error Boundary for Project Pages
 * 
 * Handles:
 * 1. Policy violations (2FA required, password expired, etc.)
 * 2. Access denied errors
 * 3. General project errors
 */
export default function ProjectError({ error, reset }: ProjectErrorProps) {
    const router = useRouter();

    // Check if this is a policy violation error
    const isPolicyViolation =
        error.message?.includes('POLICY_VIOLATION') ||
        error.message?.includes('2FA') ||
        error.message?.includes('policy') ||
        error.message?.toLowerCase().includes('two-factor') ||
        error.digest?.includes('policy');

    // Parse violation details if available
    let violationType = 'general';
    let redirectPath = '/settings/security';

    if (error.message?.includes('2FA') || error.message?.includes('two-factor')) {
        violationType = '2fa';
    } else if (error.message?.includes('password')) {
        violationType = 'password';
    } else if (error.message?.includes('IP') || error.message?.includes('allowlist')) {
        violationType = 'ip';
    }

    useEffect(() => {
        // Log the error for debugging
        console.error('[ProjectError]', error);
    }, [error]);

    // Policy Violation UI
    if (isPolicyViolation) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-6">
                <Card className="max-w-md w-full p-8 text-center">
                    {/* Icon */}
                    <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                        {violationType === '2fa' ? (
                            <ShieldExclamationIcon className="h-8 w-8 text-red-600" />
                        ) : (
                            <LockClosedIcon className="h-8 w-8 text-red-600" />
                        )}
                    </div>

                    {/* Title */}
                    <Typography variant="h2" className="mb-2">
                        Access Restricted
                    </Typography>

                    {/* Message */}
                    <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-6">
                        {violationType === '2fa' && (
                            <>This project requires Two-Factor Authentication to be enabled on your account.</>
                        )}
                        {violationType === 'password' && (
                            <>Your password does not meet this project's security requirements.</>
                        )}
                        {violationType === 'ip' && (
                            <>Your IP address is not on the allowlist for this project.</>
                        )}
                        {violationType === 'general' && (
                            <>You do not meet the security requirements for this project.</>
                        )}
                    </Typography>

                    {/* Actions */}
                    <div className="space-y-3">
                        {violationType === '2fa' && (
                            <Button
                                onClick={() => router.push('/settings/security')}
                                className="w-full"
                            >
                                <KeyIcon className="h-5 w-5 mr-2" />
                                Enable 2FA Now
                            </Button>
                        )}
                        {violationType === 'password' && (
                            <Button
                                onClick={() => router.push('/settings/security')}
                                className="w-full"
                            >
                                Update Password
                            </Button>
                        )}
                        {violationType === 'ip' && (
                            <Typography variant="body" className="text-sm text-neutral-500">
                                Contact your project administrator for access.
                            </Typography>
                        )}
                        {violationType === 'general' && (
                            <Button
                                onClick={() => router.push('/settings/security')}
                                className="w-full"
                            >
                                Review Security Settings
                            </Button>
                        )}

                        <Button
                            variant="ghost"
                            onClick={() => router.push('/projects')}
                            className="w-full"
                        >
                            Back to Projects
                        </Button>
                    </div>

                    {/* Help text */}
                    <Typography variant="body" className="text-xs text-neutral-500 mt-6">
                        Need help? Contact your project administrator or IT support.
                    </Typography>
                </Card>
            </div>
        );
    }

    // Generic Error UI
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
            <Card className="max-w-md w-full p-8 text-center">
                <div className="mx-auto w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-6">
                    <ShieldExclamationIcon className="h-8 w-8 text-yellow-600" />
                </div>

                <Typography variant="h2" className="mb-2">
                    Something went wrong
                </Typography>

                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-6">
                    {error.message || 'An unexpected error occurred while loading this project.'}
                </Typography>

                <div className="space-y-3">
                    <Button onClick={reset} className="w-full">
                        Try Again
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => router.push('/projects')}
                        className="w-full"
                    >
                        Back to Projects
                    </Button>
                </div>
            </Card>
        </div>
    );
}
