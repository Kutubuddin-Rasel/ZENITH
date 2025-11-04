'use client';

import React from 'react';
import { 
  CogIcon, 
  TrashIcon, 
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import Button from '../Button';
import Card from '../Card';
import { Integration } from './IntegrationHub';

interface IntegrationCardProps {
  integration: Integration;
  onConfigure: () => void;
  onDelete: () => void;
  onSync: () => void;
}

export const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integration,
  onConfigure,
  onDelete,
  onSync,
}) => {
  const getStatusIcon = () => {
    switch (integration.healthStatus) {
      case 'healthy':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'disconnected':
        return <XCircleIcon className="h-5 w-5 text-gray-400" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (integration.healthStatus) {
      case 'healthy':
        return 'Connected';
      case 'warning':
        return 'Warning';
      case 'error':
        return 'Error';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (integration.healthStatus) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      case 'disconnected':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatLastSync = (lastSyncAt: string | null) => {
    if (!lastSyncAt) return 'Never';
    
    const date = new Date(lastSyncAt);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const getIntegrationIcon = (type: string) => {
    const icons: Record<string, string> = {
      slack: '💬',
      github: '🐙',
      jira: '🔧',
      google_workspace: '📧',
      microsoft_teams: '👥',
      trello: '📋',
    };
    return icons[type] || '🔌';
  };

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-xl">{getIntegrationIcon(integration.type)}</span>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">{integration.name}</h3>
            <p className="text-sm text-gray-500 capitalize">{integration.type.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Status Information */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Last Sync:</span>
          <span className="text-gray-900">{formatLastSync(integration.lastSyncAt)}</span>
        </div>
        
        {integration.lastErrorAt && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Last Error:</span>
            <span className="text-red-600">{formatLastSync(integration.lastErrorAt)}</span>
          </div>
        )}

        {integration.lastErrorMessage && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
            {integration.lastErrorMessage}
          </div>
        )}
      </div>

      {/* Configuration Info */}
      <div className="space-y-2 mb-4">
        {integration.config.syncSettings && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Sync Frequency:</span>
            <span className="text-gray-900 capitalize">
              {integration.config.syncSettings.frequency}
            </span>
          </div>
        )}

        {integration.config.channels && integration.config.channels.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Channels:</span>
            <span className="text-gray-900">{integration.config.channels.length}</span>
          </div>
        )}

        {integration.config.repositories && integration.config.repositories.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Repositories:</span>
            <span className="text-gray-900">{integration.config.repositories.length}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex space-x-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onConfigure}
          className="flex-1"
        >
          <CogIcon className="h-4 w-4 mr-1" />
          Configure
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onSync}
          disabled={integration.healthStatus === 'disconnected'}
        >
          <ArrowPathIcon className="h-4 w-4" />
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={onDelete}
          className="text-red-600 hover:text-red-700"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};
