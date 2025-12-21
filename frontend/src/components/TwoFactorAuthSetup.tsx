"use client";
import React, { useState, useEffect } from 'react';
import Button from './Button';
import Input from './Input';
import Typography from './Typography';
import Card from './Card';
import Modal from './Modal';
import { CheckCircleIcon, ExclamationTriangleIcon, QrCodeIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/api-client';
import { getErrorMessage } from '../lib/error-utils';

interface TwoFactorAuthSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TwoFASecret {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

// Backend wraps responses in this envelope
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export default function TwoFactorAuthSetup({ isOpen, onClose, onSuccess }: TwoFactorAuthSetupProps) {
  const [step, setStep] = useState<'generate' | 'verify' | 'success'>('generate');
  const [secret, setSecret] = useState<TwoFASecret | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const generateSecret = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.post<ApiResponse<TwoFASecret>>('/auth/2fa/generate', {});
      // Backend wraps response in { success, data } envelope
      setSecret(response.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && step === 'generate') {
      generateSecret();
    }
  }, [isOpen, step, generateSecret]);

  const verifyAndEnable = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.post<ApiResponse<{ success: boolean; backupCodes: string[] }>>(
        '/auth/2fa/verify',
        { token: verificationCode }
      );
      // Backend wraps response in { success, data } envelope
      setBackupCodes(response.data.backupCodes);
      setStep('success');
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('generate');
    setSecret(null);
    setVerificationCode('');
    setError(null);
    setBackupCodes([]);
    onClose();
  };

  const handleSuccess = () => {
    handleClose();
    onSuccess();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Setup Two-Factor Authentication">
      <div className="space-y-6">
        {step === 'generate' && (
          <>
            <div className="text-center">
              <QrCodeIcon className="h-16 w-16 text-blue-600 mx-auto mb-4" />
              <Typography variant="h3" className="mb-2">
                Scan QR Code
              </Typography>
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                Use your authenticator app to scan this QR code
              </Typography>
            </div>

            {secret && (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-white p-4 rounded-lg">
                  {/* Using regular img tag for data URL compatibility */}
                  <img
                    src={secret.qrCodeUrl}
                    alt="2FA QR Code"
                    className="w-48 h-48"
                    width={192}
                    height={192}
                  />
                </div>

                <div className="w-full max-w-md">
                  <Typography variant="body" className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                    Or enter this code manually:
                  </Typography>
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded font-mono text-sm break-all text-neutral-900 dark:text-neutral-100">
                    {secret.secret}
                  </div>
                </div>

                <Button
                  onClick={() => setStep('verify')}
                  disabled={isLoading}
                  className="w-full"
                >
                  I&apos;ve Added the Account
                </Button>
              </div>
            )}

            {isLoading && (
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <Typography variant="body" className="mt-2">Generating 2FA secret...</Typography>
              </div>
            )}
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="text-center">
              <CheckCircleIcon className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <Typography variant="h3" className="mb-2">
                Enter Verification Code
              </Typography>
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                Enter the 6-digit code from your authenticator app
              </Typography>
            </div>

            <div className="space-y-4">
              <Input
                type="text"
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />

              {error && (
                <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  <Typography variant="body" className="text-sm">{error}</Typography>
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  variant="secondary"
                  onClick={() => setStep('generate')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={verifyAndEnable}
                  disabled={isLoading || verificationCode.length !== 6}
                  className="flex-1"
                >
                  {isLoading ? 'Verifying...' : 'Enable 2FA'}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="text-center">
              <CheckCircleIcon className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <Typography variant="h3" className="mb-2 text-green-600">
                Two-Factor Authentication Enabled!
              </Typography>
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                Save these backup codes in a safe place. You can use them to access your account if you lose your device.
              </Typography>
            </div>

            <Card className="p-4">
              <Typography variant="h4" className="mb-3">Backup Codes</Typography>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, index) => (
                  <div key={index} className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded text-center text-neutral-900 dark:text-neutral-100">
                    {code}
                  </div>
                ))}
              </div>
              <Typography variant="body" className="text-xs text-neutral-500 mt-3">
                Each code can only be used once. Store them securely!
              </Typography>
            </Card>

            <Button onClick={handleSuccess} className="w-full">
              Complete Setup
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
