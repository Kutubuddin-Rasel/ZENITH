"use client";
import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Typography from '@/components/Typography';
import Card from '@/components/Card';
import AuthLayout from '@/components/AuthLayout';
import { apiClient } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-utils';
import { ShieldExclamationIcon, CheckCircleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

/**
 * 2FA Recovery Page
 * Handles both:
 * 1. Requesting a recovery email (initial state)
 * 2. Verifying a recovery token (when coming from email link)
 */

// Backend wraps responses in this envelope
interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

interface RecoveryResponse {
    success: boolean;
    message: string;
}

function TwoFactorRecoveryContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // Check if user came from email link with token
    const emailFromUrl = searchParams.get('email');
    const tokenFromUrl = searchParams.get('token');
    const hasRecoveryLink = !!(emailFromUrl && tokenFromUrl);

    // State
    const [email, setEmail] = useState(emailFromUrl || '');
    const [step, setStep] = useState<'request' | 'sent' | 'verify' | 'success'>(
        hasRecoveryLink ? 'verify' : 'request'
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // Request recovery email
    const handleRequestRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError('Please enter your email address');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await apiClient.post<ApiResponse<RecoveryResponse>>(
                '/auth/2fa/recovery/request',
                { email }
            );

            setMessage(response.data.message);
            setStep('sent');
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    // Verify recovery token (when coming from email link)
    const handleVerifyRecovery = async () => {
        if (!emailFromUrl || !tokenFromUrl) {
            setError('Invalid recovery link');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await apiClient.post<ApiResponse<RecoveryResponse>>(
                '/auth/2fa/recovery/verify',
                { email: emailFromUrl, token: tokenFromUrl }
            );

            setMessage(response.data.message);
            setStep('success');
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-verify if coming from email link
    React.useEffect(() => {
        if (hasRecoveryLink && step === 'verify') {
            handleVerifyRecovery();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasRecoveryLink]);

    return (
        <AuthLayout
            title="2FA Recovery"
            subtitle="Regain access to your account"
        >
            <Card className="p-6">
                {/* Step 1: Request Recovery Email */}
                {step === 'request' && (
                    <>
                        <div className="text-center mb-6">
                            <ShieldExclamationIcon className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
                            <Typography variant="h3" className="mb-2">
                                Lost Access to Authenticator?
                            </Typography>
                            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                                Enter your email address to receive a recovery link.
                                This will disable 2FA so you can log in with just your password.
                            </Typography>
                        </div>

                        <form onSubmit={handleRequestRecovery} className="space-y-4">
                            <Input
                                label="Email Address"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                required
                            />

                            {error && (
                                <div className="text-red-600 text-sm">{error}</div>
                            )}

                            <Button
                                type="submit"
                                loading={isLoading}
                                fullWidth
                                className="mt-4"
                            >
                                Send Recovery Link
                            </Button>
                        </form>

                        <div className="mt-6 text-center">
                            <button
                                onClick={() => router.push('/auth/login')}
                                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                            >
                                ← Back to Login
                            </button>
                        </div>
                    </>
                )}

                {/* Step 2: Email Sent */}
                {step === 'sent' && (
                    <>
                        <div className="text-center">
                            <EnvelopeIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                            <Typography variant="h3" className="mb-2">
                                Check Your Email
                            </Typography>
                            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                                {message || 'If an account exists with this email and has 2FA enabled, a recovery link has been sent.'}
                            </Typography>
                            <Typography variant="body" className="text-neutral-500 dark:text-neutral-500 mt-4 text-sm">
                                The link will expire in 15 minutes.
                            </Typography>
                        </div>

                        <div className="mt-6 text-center space-y-4">
                            <button
                                onClick={() => setStep('request')}
                                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                            >
                                Didn&apos;t receive it? Try again
                            </button>
                            <div>
                                <button
                                    onClick={() => router.push('/auth/login')}
                                    className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
                                >
                                    ← Back to Login
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Step 3: Verifying Token */}
                {step === 'verify' && (
                    <>
                        <div className="text-center">
                            <div className="animate-spin h-12 w-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                            <Typography variant="h3" className="mb-2">
                                Verifying Recovery Link
                            </Typography>
                            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                                Please wait while we verify your recovery request...
                            </Typography>

                            {error && (
                                <div className="mt-4 text-red-600">
                                    {error}
                                    <div className="mt-4">
                                        <button
                                            onClick={() => router.push('/auth/2fa-recovery')}
                                            className="text-sm text-primary-600 hover:text-primary-700"
                                        >
                                            Request a new recovery link
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Step 4: Success */}
                {step === 'success' && (
                    <>
                        <div className="text-center">
                            <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
                            <Typography variant="h3" className="mb-2 text-green-600">
                                2FA Disabled Successfully
                            </Typography>
                            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                                {message || 'Two-factor authentication has been disabled. You can now log in with just your password.'}
                            </Typography>
                        </div>

                        <Button
                            onClick={() => router.push('/auth/login')}
                            fullWidth
                            className="mt-6"
                        >
                            Continue to Login
                        </Button>

                        <Typography variant="body" className="text-xs text-neutral-500 text-center mt-4">
                            We recommend re-enabling 2FA after logging in for better security.
                        </Typography>
                    </>
                )}
            </Card>
        </AuthLayout>
    );
}

// Loading fallback for Suspense
function RecoveryPageLoading() {
    return (
        <AuthLayout
            title="2FA Recovery"
            subtitle="Regain access to your account"
        >
            <Card className="p-6">
                <div className="text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <Typography variant="h3" className="mb-2">
                        Loading...
                    </Typography>
                </div>
            </Card>
        </AuthLayout>
    );
}

// Main page component wrapped in Suspense
export default function TwoFactorRecoveryPage() {
    return (
        <Suspense fallback={<RecoveryPageLoading />}>
            <TwoFactorRecoveryContent />
        </Suspense>
    );
}
