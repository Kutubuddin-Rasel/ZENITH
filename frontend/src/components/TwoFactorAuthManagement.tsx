import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../lib/api-client';
import { getErrorMessage } from '../lib/error-utils';
import Button from './Button';
import { SettingsCard } from './settings-ui';
import TwoFactorAuthSetup from './TwoFactorAuthSetup';
import {
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
      <SettingsCard
        title="Two-Factor Authentication"
        description="Checking security status..."
      >
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/4"></div>
          <div className="h-10 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3"></div>
        </div>
      </SettingsCard>
    );
  }

  return (
    <>
      <SettingsCard
        title="Two-Factor Authentication"
        description="Two-factor authentication adds an extra layer of security to your account by requiring a verification code from your mobile device."
        headerAction={
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${isEnabled
            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
            : 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
            }`}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        }
      >
        {error && (
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 mb-4 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
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
                  <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                    New Backup Codes Generated
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                    Save these codes in a safe place. Each code can only be used once.
                  </p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:text-sm">
                    {backupCodes.map((code, index) => (
                      <div key={index} className="bg-white dark:bg-neutral-800 p-2 rounded text-center border dark:border-neutral-700">
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      <TwoFactorAuthSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onSuccess={handleSetupSuccess}
      />

      {/* Disable 2FA Confirmation Modal */}
      {showDisable && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-neutral-200 dark:border-neutral-800">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                Disable Two-Factor Authentication?
              </h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                This will make your account less secure. Are you sure you want to continue?
              </p>
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
          </div>
        </div>
      )}
    </>
  );
}
