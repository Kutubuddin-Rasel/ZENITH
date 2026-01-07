"use client";
import React, { useState, useEffect, useRef } from 'react';
import Button from './Button';
import Input from './Input';
import Typography from './Typography';
import Card from './Card';
import {
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { setAccessToken } from '@/lib/auth-tokens';

interface TwoFactorAuthVerificationProps {
  /**
   * Signed session token from login response.
   * Contains the userId cryptographically signed by the server.
   * This prevents attackers from substituting a different userId.
   */
  twoFactorSessionToken: string;

  /**
   * Called after successful 2FA verification.
   * Access token is already stored in memory by this component.
   */
  onSuccess: () => void;

  /**
   * Called when user cancels 2FA verification.
   */
  onCancel: () => void;
}

export default function TwoFactorAuthVerification({
  twoFactorSessionToken,
  onSuccess,
  onCancel,
}: TwoFactorAuthVerificationProps) {
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes (matches backend token expiry)
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Session token expired - cancel verification
      setError('Session expired. Please login again.');
    }
  }, [timeLeft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verificationCode || verificationCode.length < 6) {
      setError('Please enter a valid verification code');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/auth/verify-2fa-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // For setting refresh token cookie
        body: JSON.stringify({
          token: verificationCode,
          twoFactorSessionToken: twoFactorSessionToken, // SECURE: Signed token, not raw userId
        }),
      });

      const data = await response.json();

      if (data.success && data.access_token) {
        // Store access token in memory
        setAccessToken(data.access_token);
        onSuccess();
      } else {
        setError(data.message || 'Invalid verification code');
        setVerificationCode('');
      }
    } catch {
      setError('Failed to verify code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setVerificationCode(value);
    setError(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <ShieldCheckIcon className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <Typography variant="h2" className="mb-2">
            Two-Factor Authentication
          </Typography>
          <Typography
            variant="body"
            className="text-neutral-600 dark:text-neutral-400"
          >
            Enter the verification code from your authenticator app
          </Typography>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="verification-code"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
              >
                Verification Code
              </label>
              <Input
                ref={inputRef}
                id="verification-code"
                type="text"
                placeholder="123456"
                value={verificationCode}
                onChange={handleCodeChange}
                maxLength={8}
                className="text-center text-2xl tracking-widest"
                disabled={isLoading || timeLeft === 0}
              />
              <Typography variant="body" className="text-xs text-neutral-500 mt-1">
                Enter 6-digit TOTP code or 8-character backup code
              </Typography>
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <ExclamationTriangleIcon className="h-5 w-5" />
                <Typography variant="body" className="text-sm">
                  {error}
                </Typography>
              </div>
            )}

            <div className="space-y-3">
              <Button
                type="submit"
                disabled={
                  isLoading || verificationCode.length < 6 || timeLeft === 0
                }
                className="w-full"
              >
                {isLoading ? 'Verifying...' : 'Verify Code'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                className="w-full"
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>

            {timeLeft > 0 && (
              <div className="text-center">
                <Typography variant="body" className="text-sm text-neutral-500">
                  Session expires in {formatTime(timeLeft)}
                </Typography>
              </div>
            )}
          </form>
        </Card>

        <div className="text-center space-y-2">
          <Typography variant="body" className="text-sm text-neutral-500">
            Having trouble? Contact your administrator for help.
          </Typography>
          <a
            href="/auth/2fa-recovery"
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 block"
          >
            Lost access to authenticator app?
          </a>
        </div>
      </div>
    </div>
  );
}
