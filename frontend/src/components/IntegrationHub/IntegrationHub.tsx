'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, CogIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from '../Button';
import Card from '../Card';
import { IntegrationCard } from './IntegrationCard';
import { IntegrationConfig } from './IntegrationConfig';
import { UniversalSearch } from './UniversalSearch';
import { apiClient } from '@/lib/api-client';
import { config } from '@/lib/config';

export interface Integration {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  healthStatus: 'healthy' | 'warning' | 'error' | 'disconnected';
  lastSyncAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  config: {
    webhookUrl?: string;
    channels?: string[];
    repositories?: string[];
    projects?: string[];
    calendarId?: string;
    driveFolderId?: string;
    teamId?: string;
    boards?: string[];
    syncSettings?: {
      enabled: boolean;
      frequency: 'realtime' | 'hourly' | 'daily';
      batchSize: number;
    };
    notifications?: {
      enabled: boolean;
      channels: string[];
      events: string[];
    };
  };
}

export interface AvailableIntegration {
  type: string;
  name: string;
  description: string;
  icon: string;
  features: string[];
  status: 'available' | 'coming_soon' | 'beta';
}

/**
 * IntegrationHub - Central hub for managing third-party integrations
 *
 * Enterprise Features:
 * - Uses centralized API client for all requests
 * - OAuth flows redirect through API_BASE_URL
 * - Consistent error handling
 */
export const IntegrationHub: React.FC = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [availableIntegrations, setAvailableIntegrations] = useState<AvailableIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const loadIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<Integration[]>('/api/integrations');
      // Defensive: ensure we always have an array
      setIntegrations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load integrations:', err);
      setError('Failed to load integrations');
      setIntegrations([]); // Ensure array on error
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvailableIntegrations = useCallback(async () => {
    try {
      const data = await apiClient.get<{ integrations: AvailableIntegration[] }>(
        '/api/integrations/marketplace/available'
      );
      setAvailableIntegrations(data.integrations);
    } catch (err) {
      console.error('Failed to load available integrations:', err);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
    loadAvailableIntegrations();
  }, [loadIntegrations, loadAvailableIntegrations]);

  const handleInstallIntegration = (integrationType: string) => {
    // Redirect to OAuth authorization flow using configured API URL
    const oauthUrl = `${config.apiUrl}/api/integrations/oauth/${integrationType.toLowerCase()}/authorize`;
    window.location.href = oauthUrl;
  };

  const handleConfigureIntegration = (integration: Integration) => {
    setSelectedIntegration(integration);
    setShowConfigModal(true);
  };

  const handleSaveIntegration = async (integration: Integration) => {
    try {
      setError(null);

      if (integration.id.startsWith('temp-')) {
        // Create new integration
        const newIntegration = await apiClient.post<Integration>('/api/integrations', {
          name: integration.name,
          type: integration.type,
          config: integration.config,
          authConfig: {
            type: 'oauth',
            accessToken: '',
            scopes: [],
          },
        });
        setIntegrations(prev => [...prev, newIntegration]);
      } else {
        // Update existing integration
        const updatedIntegration = await apiClient.put<Integration>(
          `/api/integrations/${integration.id}`,
          {
            name: integration.name,
            config: integration.config,
          }
        );
        setIntegrations(prev => prev.map(i => i.id === integration.id ? updatedIntegration : i));
      }

      setShowConfigModal(false);
      setSelectedIntegration(null);
    } catch (err) {
      console.error('Failed to save integration:', err);
      setError('Failed to save integration');
    }
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    try {
      setError(null);
      await apiClient.delete(`/api/integrations/${integrationId}`);
      setIntegrations(prev => prev.filter(i => i.id !== integrationId));
    } catch (err) {
      console.error('Failed to delete integration:', err);
      setError('Failed to delete integration');
    }
  };

  const handleSyncIntegration = async (integrationId: string) => {
    try {
      setError(null);
      await apiClient.post(`/api/integrations/${integrationId}/sync`, {});
      // Refresh integrations to get updated sync status
      await loadIntegrations();
    } catch (err) {
      console.error('Failed to sync integration:', err);
      setError('Failed to sync integration');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Integration Hub</h1>
          <p className="text-neutral-600">Connect your favorite tools and streamline your workflow</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="secondary"
            onClick={() => setShowSearch(true)}
          >
            Universal Search
          </Button>
          <Button
            onClick={() => setShowSearch(false)}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Integration
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Installed Integrations */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Installed Integrations</h2>
        {integrations.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-neutral-500">
              <CogIcon className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-medium">No integrations installed</p>
              <p className="text-sm">Connect your first tool to get started</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConfigure={() => handleConfigureIntegration(integration)}
                onDelete={() => handleDeleteIntegration(integration.id)}
                onSync={() => handleSyncIntegration(integration.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Integrations */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Available Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableIntegrations.map((integration) => (
            <Card key={integration.type} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 bg-neutral-100 rounded-lg flex items-center justify-center">
                      <span className="text-lg font-semibold text-neutral-600">
                        {integration.icon.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-lg font-medium text-neutral-900">{integration.name}</h3>
                  </div>
                  <p className="text-sm text-neutral-600 mb-3">{integration.description}</p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {integration.features.map((feature) => (
                      <span
                        key={feature}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`px-2 py-1 text-xs rounded-full ${integration.status === 'available'
                    ? 'bg-green-100 text-green-800'
                    : integration.status === 'beta'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-neutral-100 text-neutral-800'
                    }`}>
                    {integration.status === 'available' ? 'Available' :
                      integration.status === 'beta' ? 'Beta' : 'Coming Soon'}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={integration.status !== 'available'}
                onClick={() => handleInstallIntegration(integration.type)}
                className="w-full"
              >
                {integration.status === 'available' ? 'Install' :
                  integration.status === 'beta' ? 'Join Beta' : 'Coming Soon'}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Configuration Modal */}
      {showConfigModal && selectedIntegration && (
        <IntegrationConfig
          integration={selectedIntegration}
          onSave={handleSaveIntegration}
          onClose={() => {
            setShowConfigModal(false);
            setSelectedIntegration(null);
          }}
        />
      )}

      {/* Universal Search Modal */}
      {showSearch && (
        <UniversalSearch
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
};
