"use client";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from './Button';
import Typography from './Typography';
import Card from './Card';
import Modal from './Modal';
import { 
  ShieldCheckIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

interface SAMLConfig {
  id: string;
  name: string;
  provider: string;
  status: string;
  entryPoint: string;
  issuer: string;
  callbackUrl: string;
  createdAt: string;
  lastUsedAt?: string;
  usageCount: number;
}

interface SAMLConfigurationProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SAMLConfiguration({ isOpen, onClose }: SAMLConfigurationProps) {
  const { token } = useAuth();
  const [configs, setConfigs] = useState<SAMLConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setShowForm] = useState(false);
  const [, setEditingConfig] = useState<SAMLConfig | null>(null);

  const fetchConfigs = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/saml/configs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      }
    } catch {
      setError('Failed to fetch SAML configurations');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      fetchConfigs();
    }
  }, [isOpen, fetchConfigs]);

  const handleDelete = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this SAML configuration?')) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/saml/configs/${configId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setConfigs(configs.filter(c => c.id !== configId));
      } else {
        setError('Failed to delete SAML configuration');
      }
    } catch {
      setError('Failed to delete SAML configuration');
    }
  };

  const handleActivate = async (configId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/saml/configs/${configId}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchConfigs(); // Refresh the list
      } else {
        setError('Failed to activate SAML configuration');
      }
    } catch {
      setError('Failed to activate SAML configuration');
    }
  };

  const handleTest = async (configId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/saml/configs/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configId }),
      });

      const result = await response.json();
      if (result.success) {
        alert('SAML configuration test passed!');
      } else {
        alert(`SAML configuration test failed: ${result.message}`);
      }
    } catch {
      alert('Failed to test SAML configuration');
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'testing': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'inactive': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'active_directory': return '🏢';
      case 'okta': return '🔐';
      case 'azure_ad': return '☁️';
      case 'google_workspace': return '🌐';
      default: return '🔧';
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="SAML/SSO Configuration">
      <div className="space-y-6">
        {error && (
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <Typography variant="body" className="text-sm">{error}</Typography>
          </div>
        )}

        <div className="flex justify-between items-center">
          <Typography variant="h3">SAML Configurations</Typography>
          <Button onClick={() => setShowForm(true)}>
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Configuration
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            <Typography variant="body" className="mt-2">Loading configurations...</Typography>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.length === 0 ? (
              <Card className="p-8 text-center">
                <ShieldCheckIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <Typography variant="h4" className="mb-2">No SAML Configurations</Typography>
                <Typography variant="body" className="text-gray-600 dark:text-gray-400 mb-4">
                  Set up SAML/SSO integration to allow users to sign in with their organization&apos;s identity provider.
                </Typography>
                <Button onClick={() => setShowForm(true)}>
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Add First Configuration
                </Button>
              </Card>
            ) : (
              configs.map((config) => (
                <Card key={config.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">{getProviderIcon(config.provider)}</span>
                        <div>
                          <Typography variant="h4" className="font-semibold">
                            {config.name}
                          </Typography>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(config.status)}`}>
                              {config.status.charAt(0).toUpperCase() + config.status.slice(1)}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {config.provider.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <Typography variant="body" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Entry Point
                          </Typography>
                          <Typography variant="body" className="text-sm font-mono break-all">
                            {config.entryPoint}
                          </Typography>
                        </div>
                        <div>
                          <Typography variant="body" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Issuer
                          </Typography>
                          <Typography variant="body" className="text-sm font-mono break-all">
                            {config.issuer}
                          </Typography>
                        </div>
                        <div>
                          <Typography variant="body" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Callback URL
                          </Typography>
                          <Typography variant="body" className="text-sm font-mono break-all">
                            {config.callbackUrl}
                          </Typography>
                        </div>
                        <div>
                          <Typography variant="body" className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Usage
                          </Typography>
                          <Typography variant="body" className="text-sm">
                            {config.usageCount} times
                            {config.lastUsedAt && (
                              <span className="text-gray-500 dark:text-gray-400">
                                {' '}(last used: {new Date(config.lastUsedAt).toLocaleDateString()})
                              </span>
                            )}
                          </Typography>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(config.id)}
                        title="Test Configuration"
                      >
                        <CheckCircleIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingConfig(config)}
                        title="Edit Configuration"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      {config.status !== 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleActivate(config.id)}
                          title="Activate Configuration"
                        >
                          <ShieldCheckIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(config.id)}
                        title="Delete Configuration"
                        className="text-red-600 hover:text-red-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
