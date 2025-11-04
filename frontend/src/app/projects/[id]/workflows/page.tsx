'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import PageLayout from '../../../../components/PageLayout';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Spinner from '../../../../components/Spinner';
import WorkflowDesigner from '../../../../components/WorkflowDesigner/WorkflowDesigner';
import type { Workflow, WorkflowDefinition } from '../../../../components/WorkflowDesigner/WorkflowDesigner';
import AutomationRulesManager from '../../../../components/AutomationRules/AutomationRulesManager';
import WorkflowTemplatesMarketplace from '../../../../components/WorkflowTemplates/WorkflowTemplatesMarketplace';
import {
  Cog6ToothIcon,
  PlayIcon,
  ChartBarIcon,
  DocumentTextIcon as TemplateIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  isActive: boolean;
  version: number;
  definition: WorkflowDefinition;
  executionCount: number;
  lastExecutedAt?: string;
  successRate?: number;
  averageExecutionTime?: number;
  tags?: string[];
  category?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  triggerEvent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  startedAt: string;
  completedAt?: string;
  executionTime?: number;
  errorMessage?: string;
}

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  conditions?: Record<string, unknown>[];
  actions: Record<string, unknown>[];
  status: 'active' | 'inactive' | 'error' | 'testing';
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  templateDefinition: Record<string, unknown>;
  usageCount: number;
  rating?: number;
  isPublic: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// Conversion functions between WorkflowItem and Workflow
const convertWorkflowItemToWorkflow = (workflowItem: WorkflowItem): Workflow => ({
  id: workflowItem.id,
  name: workflowItem.name,
  description: workflowItem.description,
  definition: workflowItem.definition,
  isActive: workflowItem.isActive,
  version: workflowItem.version,
  createdAt: workflowItem.createdAt,
  updatedAt: workflowItem.updatedAt,
});

const convertWorkflowToWorkflowItem = (workflow: Workflow): WorkflowItem => ({
  id: workflow.id,
  name: workflow.name,
  description: workflow.description,
  status: 'active' as const,
  isActive: workflow.isActive,
  version: workflow.version,
  definition: workflow.definition,
  executionCount: 0,
  createdAt: workflow.createdAt,
  updatedAt: workflow.updatedAt,
});

export default function WorkflowsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [activeTab, setActiveTab] = useState<'workflows' | 'rules' | 'templates' | 'analytics'>('workflows');
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWorkflowDesigner, setShowWorkflowDesigner] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    category: 'all',
  });

  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        projectId,
        ...(filters.search && { search: filters.search }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.category !== 'all' && { category: filters.category }),
      });

      const response = await fetch(`/api/workflows?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setWorkflows(result.data);
      } else {
        setError(result.error || 'Failed to load workflows');
      }
    } catch (err) {
      console.error('Error loading workflows:', err);
      setError('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [projectId, filters]);

  const loadRecentExecutions = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflow-analytics/project/${projectId}/analytics`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        // This would be populated from the analytics data
        setExecutions([]);
      }
    } catch (err) {
      console.error('Error loading executions:', err);
    }
  }, [projectId]);

  useEffect(() => {
    loadWorkflows();
    loadRecentExecutions();
  }, [loadWorkflows, loadRecentExecutions]);

  const executeWorkflow = async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          context: {
            triggerEvent: 'manual',
            triggerData: {},
            variables: {},
            userId: 'current-user',
            projectId,
          },
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Refresh workflows to update execution count
        loadWorkflows();
      } else {
        setError(result.error || 'Failed to execute workflow');
      }
    } catch (err) {
      console.error('Error executing workflow:', err);
      setError('Failed to execute workflow');
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setWorkflows(workflows.filter(w => w.id !== workflowId));
      } else {
        setError(result.error || 'Failed to delete workflow');
      }
    } catch (err) {
      console.error('Error deleting workflow:', err);
      setError('Failed to delete workflow');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'inactive':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'archived':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // const getExecutionStatusColor = (status: string) => {
  //   switch (status) {
  //     case 'completed':
  //       return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  //     case 'running':
  //       return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  //     case 'failed':
  //       return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  //     case 'cancelled':
  //       return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  //     default:
  //       return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  //   }
  // };

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

  const tabs = [
    { id: 'workflows', name: 'Workflows', icon: Cog6ToothIcon },
    { id: 'rules', name: 'Automation Rules', icon: PlayIcon },
    { id: 'templates', name: 'Templates', icon: TemplateIcon },
    { id: 'analytics', name: 'Analytics', icon: ChartBarIcon },
  ];

  return (
    <PageLayout
      title="Workflows & Automation"
      subtitle="Manage workflows, automation rules, and templates"
    >
      <div className="space-y-6">
        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'workflows' | 'rules' | 'templates' | 'analytics')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Workflows Tab */}
        {activeTab === 'workflows' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Workflows
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Create and manage automated workflows
                </p>
              </div>
              <Button onClick={() => setShowWorkflowDesigner(true)}>
                <PlusIcon className="h-5 w-5 mr-2" />
                Create Workflow
              </Button>
            </div>

            {/* Filters */}
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Search
                  </label>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Search workflows..."
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
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
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
                    <option value="approval">Approval</option>
                    <option value="development">Development</option>
                    <option value="marketing">Marketing</option>
                    <option value="custom">Custom</option>
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

            {/* Workflows List */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Spinner className="h-8 w-8" />
              </div>
            ) : workflows.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <Cog6ToothIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No workflows found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Create your first workflow to get started
                  </p>
                  <Button onClick={() => setShowWorkflowDesigner(true)}>
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Create Workflow
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {workflows.map((workflow) => (
                  <Card key={workflow.id}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl">{workflow.icon || '⚙️'}</span>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {workflow.name}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Version {workflow.version}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(workflow.status)}`}>
                            {workflow.status}
                          </span>
                        </div>
                        
                        {workflow.description && (
                          <p className="text-gray-600 dark:text-gray-400 mb-3">
                            {workflow.description}
                          </p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Executions:</span>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {workflow.executionCount}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Success Rate:</span>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {workflow.successRate ? `${workflow.successRate}%` : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Avg Time:</span>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {workflow.averageExecutionTime ? `${workflow.averageExecutionTime}ms` : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Last Executed:</span>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {formatLastExecuted(workflow.lastExecutedAt)}
                            </div>
                          </div>
                        </div>

                        {workflow.tags && workflow.tags.length > 0 && (
                          <div className="mt-3">
                            <div className="flex flex-wrap gap-1">
                              {workflow.tags.map((tag, index) => (
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
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => executeWorkflow(workflow.id)}
                          title="Execute Workflow"
                        >
                          <PlayIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedWorkflow(workflow);
                            setShowWorkflowDesigner(true);
                          }}
                          title="Edit Workflow"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => deleteWorkflow(workflow.id)}
                          title="Delete Workflow"
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
          </div>
        )}

        {/* Automation Rules Tab */}
        {activeTab === 'rules' && (
          <AutomationRulesManager
            projectId={projectId}
            onRuleCreated={(rule: AutomationRule) => {
              console.log('Rule created:', rule);
              loadWorkflows(); // Refresh workflows
            }}
            onRuleUpdated={(rule: AutomationRule) => {
              console.log('Rule updated:', rule);
              loadWorkflows(); // Refresh workflows
            }}
            onRuleDeleted={(ruleId: string) => {
              console.log('Rule deleted:', ruleId);
              loadWorkflows(); // Refresh workflows
            }}
          />
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <WorkflowTemplatesMarketplace
            projectId={projectId}
            onTemplateSelected={(template: WorkflowTemplate) => {
              console.log('Template selected:', template);
              setActiveTab('workflows');
              loadWorkflows();
            }}
          />
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Workflow Analytics
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Monitor workflow performance and usage
              </p>
            </div>
            <Card>
              <div className="text-center py-12">
                <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Analytics Coming Soon
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Detailed analytics and reporting features will be available soon
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Workflow Designer Modal */}
        {showWorkflowDesigner && (
          <WorkflowDesigner
            isOpen={showWorkflowDesigner}
            onClose={() => {
              setShowWorkflowDesigner(false);
              setSelectedWorkflow(null);
            }}
            onSave={(workflow: Workflow) => {
              const workflowItem = convertWorkflowToWorkflowItem(workflow);
              setWorkflows([workflowItem, ...workflows]);
              setShowWorkflowDesigner(false);
              setSelectedWorkflow(null);
            }}
            initialWorkflow={selectedWorkflow ? convertWorkflowItemToWorkflow(selectedWorkflow) : undefined}
            projectId={projectId}
          />
        )}
      </div>
    </PageLayout>
  );
}
