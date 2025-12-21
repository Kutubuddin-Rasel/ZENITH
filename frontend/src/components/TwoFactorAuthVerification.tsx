"use client";
import React, { useState, useEffect, useRef } from 'react';
import Button from './Button';
import Input from './Input';
import Typography from './Typography';
import Card from './Card';
import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

interface TwoFactorAuthVerificationProps {
  userId: string;
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

export default function TwoFactorAuthVerification({ userId, onSuccess, onCancel }: TwoFactorAuthVerificationProps) {
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
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

      // Use hardcoded API URL to ensure it's correct
      const API_URL = 'http://localhost:3000';
      const response = await fetch(`${API_URL}/auth/verify-2fa-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          token: verificationCode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess(data.access_token);
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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <ShieldCheckIcon className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <Typography variant="h2" className="mb-2">
            Two-Factor Authentication
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Enter the verification code from your authenticator app
          </Typography>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="verification-code" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
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
                disabled={isLoading}
              />
              <Typography variant="body" className="text-xs text-neutral-500 mt-1">
                Enter 6-digit TOTP code or 8-character backup code
              </Typography>
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <ExclamationTriangleIcon className="h-5 w-5" />
                <Typography variant="body" className="text-sm">{error}</Typography>
              </div>
            )}

            <div className="space-y-3">
              <Button
                type="submit"
                disabled={isLoading || verificationCode.length < 6}
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
                  Code expires in {timeLeft} seconds
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
