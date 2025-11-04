'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Card from '../Card';
import Button from '../Button';
import Modal from '../Modal';
import Spinner from '../Spinner';
import {
  PlusIcon,
  Cog6ToothIcon,
  PlayIcon,
  PauseIcon,
  TrashIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  conditions?: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
  status: 'active' | 'inactive' | 'error' | 'testing';
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string;
  successRate?: number;
  averageExecutionTime?: number;
  lastError?: string;
  tags?: string[];
  category?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

interface AutomationRulesManagerProps {
  projectId: string;
  onRuleCreated?: (rule: AutomationRule) => void;
  onRuleUpdated?: (rule: AutomationRule) => void;
  onRuleDeleted?: (ruleId: string) => void;
}

export default function AutomationRulesManager({
  projectId,
  onRuleCreated,
  onRuleUpdated,
  onRuleDeleted,
}: AutomationRulesManagerProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    triggerType: 'all',
    category: 'all',
  });

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      queryParams.append('projectId', projectId);
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.status !== 'all') queryParams.append('isActive', filters.status === 'active' ? 'true' : 'false');
      if (filters.triggerType !== 'all') queryParams.append('triggerType', filters.triggerType);
      if (filters.category !== 'all') queryParams.append('category', filters.category);

      const response = await fetch(`/api/automation-rules?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setRules(result.data);
      } else {
        setError(result.error || 'Failed to load rules');
      }
    } catch (err) {
      console.error('Error loading rules:', err);
      setError('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [projectId, filters]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const toggleRule = async (ruleId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/automation-rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setRules(rules.map(rule => 
          rule.id === ruleId ? result.data : rule
        ));
        onRuleUpdated?.(result.data);
      } else {
        setError(result.error || 'Failed to toggle rule');
      }
    } catch (err) {
      console.error('Error toggling rule:', err);
      setError('Failed to toggle rule');
    }
  };

  const deleteRule = async (ruleId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const response = await fetch(`/api/automation-rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setRules(rules.filter(rule => rule.id !== ruleId));
        onRuleDeleted?.(ruleId);
      } else {
        setError(result.error || 'Failed to delete rule');
      }
    } catch (err) {
      console.error('Error deleting rule:', err);
      setError('Failed to delete rule');
    }
  };

  const testRule = async (ruleId: string, testContext: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> => {
    try {
      const response = await fetch(`/api/automation-rules/${ruleId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ testContext }),
      });

      const result = await response.json();
      return result;
    } catch (err) {
      console.error('Error testing rule:', err);
      return { success: false, error: 'Failed to test rule' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'inactive':
        return <PauseIcon className="h-5 w-5 text-gray-400" />;
      case 'error':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      case 'testing':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <Cog6ToothIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'inactive':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'testing':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const formatLastExecuted = (lastExecutedAt?: string) => {
    if (!lastExecutedAt) return 'Never';
    const date = new Date(lastExecutedAt);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Automation Rules
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage automated workflows and triggers
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Search rules..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Trigger Type
            </label>
            <select
              value={filters.triggerType}
              onChange={(e) => setFilters({ ...filters, triggerType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="field_change">Field Change</option>
              <option value="time_based">Time Based</option>
              <option value="user_action">User Action</option>
              <option value="external_event">External Event</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              <option value="issue_management">Issue Management</option>
              <option value="notification">Notification</option>
              <option value="assignment">Assignment</option>
              <option value="status_update">Status Update</option>
              <option value="time_based">Time Based</option>
              <option value="integration">Integration</option>
              <option value="approval">Approval</option>
              <option value="escalation">Escalation</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Error
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Cog6ToothIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No automation rules found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create your first automation rule to get started
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <PlusIcon className="h-5 w-5 mr-2" />
              Create Rule
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(rule.status)}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {rule.name}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(rule.status)}`}>
                      {rule.status}
                    </span>
                  </div>
                  
                  {rule.description && (
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                      {rule.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Trigger:</span>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {rule.triggerType.replace('_', ' ')}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Executions:</span>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {rule.executionCount}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Success Rate:</span>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {rule.successRate ? `${rule.successRate}%` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Last Executed:</span>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {formatLastExecuted(rule.lastExecutedAt)}
                      </div>
                    </div>
                  </div>

                  {rule.tags && rule.tags.length > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-1">
                        {rule.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {rule.lastError && (
                    <div className="mt-3 p-2 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300">
                      <strong>Last Error:</strong> {rule.lastError}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedRule(rule);
                      setShowTestModal(true);
                    }}
                    title="Test Rule"
                  >
                    <PlayIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleRule(rule.id)}
                    title={rule.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {rule.isActive ? (
                      <PauseIcon className="h-4 w-4" />
                    ) : (
                      <PlayIcon className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedRule(rule);
                      setShowEditModal(true);
                    }}
                    title="Edit Rule"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => deleteRule(rule.id)}
                    title="Delete Rule"
                    className="text-red-600 hover:text-red-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateRuleModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onRuleCreated={(rule) => {
            setRules([rule, ...rules]);
            onRuleCreated?.(rule);
            setShowCreateModal(false);
          }}
        />
      )}

      {showEditModal && selectedRule && (
        <EditRuleModal
          rule={selectedRule}
          onClose={() => {
            setShowEditModal(false);
            setSelectedRule(null);
          }}
          onRuleUpdated={(rule) => {
            setRules(rules.map(r => r.id === rule.id ? rule : r));
            onRuleUpdated?.(rule);
            setShowEditModal(false);
            setSelectedRule(null);
          }}
        />
      )}

      {showTestModal && selectedRule && (
        <TestRuleModal
          rule={selectedRule}
          onClose={() => {
            setShowTestModal(false);
            setSelectedRule(null);
          }}
          onTest={(testContext: Record<string, unknown>) => testRule(selectedRule?.id || '', testContext)}
        />
      )}
    </div>
  );
}

// Placeholder components - these would be implemented separately
function CreateRuleModal({ projectId, onClose }: { projectId: string; onClose: () => void; onRuleCreated: (rule: AutomationRule) => void }) {
  return (
    <Modal open={true} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Create Automation Rule</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Rule creation form would be implemented here for project {projectId}.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Create Rule</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditRuleModal({ rule, onClose }: { rule: AutomationRule; onClose: () => void; onRuleUpdated: (rule: AutomationRule) => void }) {
  return (
    <Modal open={true} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Edit Automation Rule</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Rule editing form would be implemented here for rule: {rule.name}.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  );
}

function TestRuleModal({ rule, onClose }: { rule: AutomationRule; onClose: () => void; onTest: (testContext: Record<string, unknown>) => void }) {
  return (
    <Modal open={true} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Test Rule: {rule.name}</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Rule testing interface would be implemented here for rule: {rule.name}.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Test Rule</Button>
        </div>
      </div>
    </Modal>
  );
}
