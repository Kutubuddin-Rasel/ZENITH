'use client';

import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Button from '../Button';
import Modal from '../Modal';
import Input from '../Input';
import { Integration } from './IntegrationHub';

interface IntegrationConfigProps {
  integration: Integration;
  onSave: (integration: Integration) => void;
  onClose: () => void;
}

export const IntegrationConfig: React.FC<IntegrationConfigProps> = ({
  integration,
  onSave,
  onClose,
}) => {
  const [config, setConfig] = useState(integration.config);
  const [name, setName] = useState(integration.name);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedIntegration = {
        ...integration,
        name,
        config,
      };
      await onSave(updatedIntegration);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (path: string, value: unknown) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      const keys = path.split('.');
      let current: Record<string, unknown> = newConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as Record<string, unknown>;
      }
      
      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
  };

  const renderSlackConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook URL
        </label>
        <Input
          type="url"
          value={config.webhookUrl || ''}
          onChange={(e) => updateConfig('webhookUrl', e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Channels
        </label>
        <Input
          value={config.channels?.join(', ') || ''}
          onChange={(e) => updateConfig('channels', e.target.value.split(',').map(c => c.trim()).filter(c => c))}
          placeholder="#general, #dev-team"
        />
        <p className="text-xs text-gray-500 mt-1">
          Comma-separated list of channel names
        </p>
      </div>
    </div>
  );

  const renderGitHubConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Repositories
        </label>
        <Input
          value={config.repositories?.join(', ') || ''}
          onChange={(e) => updateConfig('repositories', e.target.value.split(',').map(r => r.trim()).filter(r => r))}
          placeholder="owner/repo1, owner/repo2"
        />
        <p className="text-xs text-gray-500 mt-1">
          Comma-separated list of repositories (owner/repo format)
        </p>
      </div>
    </div>
  );

  const renderJiraConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Projects
        </label>
        <Input
          value={config.projects?.join(', ') || ''}
          onChange={(e) => updateConfig('projects', e.target.value.split(',').map(p => p.trim()).filter(p => p))}
          placeholder="PROJ1, PROJ2"
        />
        <p className="text-xs text-gray-500 mt-1">
          Comma-separated list of Jira project keys
        </p>
      </div>
    </div>
  );

  const renderSyncSettings = () => (
    <div className="space-y-4">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="syncEnabled"
          checked={config.syncSettings?.enabled || false}
          onChange={(e) => updateConfig('syncSettings.enabled', e.target.checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="syncEnabled" className="ml-2 text-sm font-medium text-gray-700">
          Enable automatic synchronization
        </label>
      </div>

      {config.syncSettings?.enabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sync Frequency
            </label>
            <select
              value={config.syncSettings?.frequency || 'daily'}
              onChange={(e) => updateConfig('syncSettings.frequency', e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="realtime">Real-time</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Batch Size
            </label>
            <Input
              type="number"
              value={config.syncSettings?.batchSize || 100}
              onChange={(e) => updateConfig('syncSettings.batchSize', parseInt(e.target.value))}
              min="1"
              max="1000"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of records to process in each sync batch
            </p>
          </div>
        </>
      )}
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-4">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="notificationsEnabled"
          checked={config.notifications?.enabled || false}
          onChange={(e) => updateConfig('notifications.enabled', e.target.checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="notificationsEnabled" className="ml-2 text-sm font-medium text-gray-700">
          Enable notifications
        </label>
      </div>

      {config.notifications?.enabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notification Channels
            </label>
            <Input
              value={config.notifications?.channels?.join(', ') || ''}
              onChange={(e) => updateConfig('notifications.channels', e.target.value.split(',').map(c => c.trim()).filter(c => c))}
              placeholder="#notifications, #alerts"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated list of channels for notifications
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Events to Notify
            </label>
            <div className="space-y-2">
              {['issue_created', 'issue_updated', 'issue_commented', 'sprint_started', 'sprint_completed'].map((event) => (
                <div key={event} className="flex items-center">
                  <input
                    type="checkbox"
                    id={event}
                    checked={config.notifications?.events?.includes(event) || false}
                    onChange={(e) => {
                      const events = config.notifications?.events || [];
                      if (e.target.checked) {
                        updateConfig('notifications.events', [...events, event]);
                      } else {
                        updateConfig('notifications.events', events.filter(ev => ev !== event));
                      }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor={event} className="ml-2 text-sm text-gray-700">
                    {event.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderGoogleWorkspaceConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Calendar ID
        </label>
        <Input
          value={config.calendarId || ''}
          onChange={(e) => updateConfig('calendarId', e.target.value)}
          placeholder="primary"
        />
        <p className="text-xs text-gray-500 mt-1">
          Leave empty to use primary calendar
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Drive Folder ID
        </label>
        <Input
          value={config.driveFolderId || ''}
          onChange={(e) => updateConfig('driveFolderId', e.target.value)}
          placeholder="Leave empty to sync all files"
        />
        <p className="text-xs text-gray-500 mt-1">
          Optional: Sync only files from a specific folder
        </p>
      </div>
    </div>
  );

  const renderMicrosoftTeamsConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Team ID
        </label>
        <Input
          value={config.teamId || ''}
          onChange={(e) => updateConfig('teamId', e.target.value)}
          placeholder="Enter Microsoft Teams team ID"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Webhook URL
        </label>
        <Input
          type="url"
          value={config.webhookUrl || ''}
          onChange={(e) => updateConfig('webhookUrl', e.target.value)}
          placeholder="https://outlook.office.com/webhook/..."
        />
        <p className="text-xs text-gray-500 mt-1">
          For sending notifications to Teams channels
        </p>
      </div>
    </div>
  );

  const renderTrelloConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Board IDs
        </label>
        <Input
          value={config.boards?.join(', ') || ''}
          onChange={(e) => updateConfig('boards', e.target.value.split(',').map(b => b.trim()).filter(b => b))}
          placeholder="board1, board2, board3"
        />
        <p className="text-xs text-gray-500 mt-1">
          Comma-separated list of Trello board IDs
        </p>
      </div>
    </div>
  );

  const renderIntegrationSpecificConfig = () => {
    switch (integration.type) {
      case 'slack':
        return renderSlackConfig();
      case 'github':
        return renderGitHubConfig();
      case 'jira':
        return renderJiraConfig();
      case 'google_workspace':
        return renderGoogleWorkspaceConfig();
      case 'microsoft_teams':
        return renderMicrosoftTeamsConfig();
      case 'trello':
        return renderTrelloConfig();
      default:
        return (
          <div className="text-gray-500 text-sm">
            No specific configuration required for this integration.
          </div>
        );
    }
  };

  return (
    <Modal open={true} onClose={onClose} maxWidthClass="sm:max-w-4xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Configure {integration.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Basic Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Settings</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Integration Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter integration name"
              />
            </div>
          </div>

          {/* Integration-Specific Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {integration.name} Settings
            </h3>
            {renderIntegrationSpecificConfig()}
          </div>

          {/* Sync Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Synchronization</h3>
            {renderSyncSettings()}
          </div>

          {/* Notification Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Notifications</h3>
            {renderNotificationSettings()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
