"use client";
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import TextArea from './TextArea';
import Typography from './Typography';
import Card from './Card';
import Modal from './Modal';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface SAMLConfig {
  id?: string;
  name: string;
  provider: string;
  entryPoint: string;
  issuer: string;
  cert: string;
  privateCert?: string;
  privateKey?: string;
  callbackUrl?: string;
  logoutUrl?: string;
  attributeMapping?: {
    email: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    groups?: string;
  };
  groupMapping?: { [key: string]: string };
  metadataUrl?: string;
  metadata?: string;
}

interface SAMLConfigurationFormProps {
  isOpen: boolean;
  onClose: () => void;
  config?: SAMLConfig | null;
  onSuccess: () => void;
}

const SAML_PROVIDERS = [
  { value: 'active_directory', label: 'Active Directory', icon: '🏢' },
  { value: 'okta', label: 'Okta', icon: '🔐' },
  { value: 'azure_ad', label: 'Azure AD', icon: '☁️' },
  { value: 'google_workspace', label: 'Google Workspace', icon: '🌐' },
  { value: 'custom', label: 'Custom', icon: '🔧' },
];

export default function SAMLConfigurationForm({ isOpen, onClose, config, onSuccess }: SAMLConfigurationFormProps) {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCert, setShowCert] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<SAMLConfig>({
    defaultValues: {
      name: '',
      provider: 'active_directory',
      entryPoint: '',
      issuer: '',
      cert: '',
      privateCert: '',
      privateKey: '',
      callbackUrl: '',
      logoutUrl: '',
      attributeMapping: {
        email: 'email',
        firstName: 'firstName',
        lastName: 'lastName',
        username: 'username',
        groups: 'groups',
      },
      groupMapping: {},
      metadataUrl: '',
      metadata: '',
    },
  });

  const watchedProvider = watch('provider');

  useEffect(() => {
    if (config) {
      reset(config);
    } else {
      reset({
        name: '',
        provider: 'active_directory',
        entryPoint: '',
        issuer: '',
        cert: '',
        privateCert: '',
        privateKey: '',
        callbackUrl: '',
        logoutUrl: '',
        attributeMapping: {
          email: 'email',
          firstName: 'firstName',
          lastName: 'lastName',
          username: 'username',
          groups: 'groups',
        },
        groupMapping: {},
        metadataUrl: '',
        metadata: '',
      });
    }
  }, [config, reset]);

  const onSubmit = async (data: SAMLConfig) => {
    try {
      setIsLoading(true);
      setError(null);

      const url = config?.id
        ? `${process.env.NEXT_PUBLIC_API_URL}/auth/saml/configs/${config.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/auth/saml/configs`;

      const method = config?.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to save SAML configuration');
      }
    } catch {
      setError('Failed to save SAML configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    setError(null);
    setShowAdvanced(false);
    setShowCert(false);
    onClose();
  };

  const getProviderHints = (provider: string) => {
    switch (provider) {
      case 'active_directory':
        return {
          entryPoint: 'https://your-domain.com/adfs/ls/',
          issuer: 'https://your-domain.com/adfs/services/trust',
          cert: 'X.509 certificate from ADFS',
        };
      case 'okta':
        return {
          entryPoint: 'https://your-domain.okta.com/app/your-app/sso/saml',
          issuer: 'http://www.okta.com/your-app-id',
          cert: 'X.509 certificate from Okta',
        };
      case 'azure_ad':
        return {
          entryPoint: 'https://login.microsoftonline.com/tenant-id/saml2',
          issuer: 'https://sts.windows.net/tenant-id/',
          cert: 'X.509 certificate from Azure AD',
        };
      case 'google_workspace':
        return {
          entryPoint: 'https://accounts.google.com/o/saml2/idp?idpid=your-idp-id',
          issuer: 'https://accounts.google.com/o/saml2?idpid=your-idp-id',
          cert: 'X.509 certificate from Google',
        };
      default:
        return {
          entryPoint: 'https://your-idp.com/sso/saml',
          issuer: 'https://your-idp.com/metadata',
          cert: 'X.509 certificate from your IdP',
        };
    }
  };

  const hints = getProviderHints(watchedProvider);

  return (
    <Modal open={isOpen} onClose={handleClose} title={config ? 'Edit SAML Configuration' : 'Add SAML Configuration'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <Typography variant="body" className="text-sm">{error}</Typography>
          </div>
        )}

        {/* Basic Configuration */}
        <Card className="p-4">
          <Typography variant="h4" className="mb-4">Basic Configuration</Typography>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Configuration Name *
              </label>
              <Input
                {...register('name', { required: 'Name is required' })}
                placeholder="e.g., Company Active Directory"
                error={errors.name?.message}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Identity Provider *
              </label>
              <Select
                {...register('provider', { required: 'Provider is required' })}
              >
                {SAML_PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.icon} {provider.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Entry Point (SSO URL) *
              </label>
              <Input
                {...register('entryPoint', { required: 'Entry point is required' })}
                placeholder={hints.entryPoint}
                error={errors.entryPoint?.message}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Issuer (Entity ID) *
              </label>
              <Input
                {...register('issuer', { required: 'Issuer is required' })}
                placeholder={hints.issuer}
                error={errors.issuer?.message}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                X.509 Certificate *
              </label>
              <div className="relative">
                <TextArea
                  {...register('cert', { required: 'Certificate is required' })}
                  placeholder={hints.cert}
                  rows={4}
                  className="font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCert(!showCert)}
                  className="absolute top-2 right-2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  {showCert ? <XMarkIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
              {errors.cert && (
                <Typography variant="body" className="text-red-600 text-sm mt-1">
                  {errors.cert.message}
                </Typography>
              )}
            </div>
          </div>
        </Card>

        {/* Advanced Configuration */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Typography variant="h4">Advanced Configuration</Typography>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Callback URL (ACS URL)
                  </label>
                  <Input
                    {...register('callbackUrl')}
                    placeholder="https://your-app.com/auth/saml/callback"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Logout URL (SLO URL)
                  </label>
                  <Input
                    {...register('logoutUrl')}
                    placeholder="https://your-idp.com/logout"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Private Certificate (Optional)
                </label>
                <TextArea
                  {...register('privateCert')}
                  placeholder="Private certificate for signing requests"
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Private Key (Optional)
                </label>
                <TextArea
                  {...register('privateKey')}
                  placeholder="Private key for signing requests"
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isLoading}
            disabled={!isDirty && !config}
          >
            {config ? 'Update Configuration' : 'Create Configuration'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
