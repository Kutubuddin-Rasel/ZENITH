import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../lib/api-client';
import { getErrorMessage } from '../lib/error-utils';
import Button from './Button';
import Typography from './Typography';
import Card from './Card';
import TwoFactorAuthSetup from './TwoFactorAuthSetup';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

export default function TwoFactorAuthManagement() {
  const { } = useAuth();
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const check2FAStatus = React.useCallback(async () => {
    try {
      const data = await apiClient.get<{ isEnabled: boolean }>('/auth/2fa/status');
      setIsEnabled(data.isEnabled);
    } catch (err) {
      console.error('Failed to check 2FA status:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    check2FAStatus();
  }, [check2FAStatus]);

  const handleDisable2FA = async () => {
    try {
      await apiClient.delete('/auth/2fa/disable', { password: 'dummy' });
      setIsEnabled(false);
      setShowDisable(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleRegenerateBackupCodes = async () => {
    try {
      const data = await apiClient.post<{ backupCodes: string[] }>('/auth/2fa/regenerate-backup-codes', {});
      setBackupCodes(data.backupCodes);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSetupSuccess = () => {
    setIsEnabled(true);
    setShowSetup(false);
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <ShieldCheckIcon className="h-6 w-6 text-blue-600" />
            <Typography variant="h3">Two-Factor Authentication</Typography>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${isEnabled
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>

        <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-6">
          Two-factor authentication adds an extra layer of security to your account by requiring a verification code from your mobile device.
        </Typography>

        {error && (
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 mb-4">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <Typography variant="body" className="text-sm">{error}</Typography>
          </div>
        )}

        <div className="space-y-4">
          {!isEnabled ? (
            <Button onClick={() => setShowSetup(true)} className="w-full sm:w-auto">
              <KeyIcon className="h-5 w-5 mr-2" />
              Enable Two-Factor Authentication
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="secondary"
                  onClick={handleRegenerateBackupCodes}
                  className="flex-1"
                >
                  Regenerate Backup Codes
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowDisable(true)}
                  className="flex-1"
                >
                  <TrashIcon className="h-5 w-5 mr-2" />
                  Disable 2FA
                </Button>
              </div>

              {backupCodes.length > 0 && (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <Typography variant="h4" className="text-yellow-800 dark:text-yellow-200 mb-2">
                    New Backup Codes Generated
                  </Typography>
                  <Typography variant="body" className="text-yellow-700 dark:text-yellow-300 mb-3">
                    Save these codes in a safe place. Each code can only be used once.
                  </Typography>
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {backupCodes.map((code, index) => (
                      <div key={index} className="bg-white dark:bg-neutral-800 p-2 rounded text-center border">
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <TwoFactorAuthSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onSuccess={handleSetupSuccess}
      />

      {/* Disable 2FA Confirmation Modal */}
      {showDisable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full p-6">
            <div className="text-center">
              <ExclamationTriangleIcon className="h-16 w-16 text-red-600 mx-auto mb-4" />
              <Typography variant="h3" className="mb-2">
                Disable Two-Factor Authentication?
              </Typography>
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-6">
                This will make your account less secure. Are you sure you want to continue?
              </Typography>
              <div className="flex space-x-3">
                <Button
                  variant="secondary"
                  onClick={() => setShowDisable(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDisable2FA}
                  className="flex-1"
                >
                  Disable 2FA
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
