'use client';

import React, { useState, useEffect } from 'react';
import { Users, Target, AlertCircle, CheckCircle, Clock, DollarSign, Brain } from 'lucide-react';

interface ResourceSuggestion {
  userId: string;
  userName: string;
  skillMatch: number;
  availability: number;
  cost: number;
  confidence: number;
  reasons: string[];
}

interface AllocationConflict {
  id: string;
  userId: string;
  userName: string;
  conflictDate: string;
  totalAllocationPercentage: number;
  conflictingAllocations: Array<{
    id: string;
    projectId: string;
    projectName: string;
    allocationPercentage: number;
  }>;
  severity: string;
  status: string;
}

interface ResourceAllocationProps {
  className?: string;
}

export default function ResourceAllocation({ className = '' }: ResourceAllocationProps) {
  const [suggestions, setSuggestions] = useState<ResourceSuggestion[]>([]);
  const [conflicts, setConflicts] = useState<AllocationConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTask, setSelectedTask] = useState('');

  useEffect(() => {
    loadAllocationData();
  }, [selectedProject, selectedTask]);

  const loadAllocationData = async () => {
    try {
      setLoading(true);

      const [conflictsResponse, suggestionsResponse] = await Promise.all([
        fetch('/api/resource-allocation/conflicts', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        }),
        fetch('/api/resource-allocation/suggestions/task-123', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        }),
      ]);

      if (conflictsResponse.ok) {
        const conflictsData = await conflictsResponse.json();
        setConflicts(conflictsData.data || []);
      }

      if (suggestionsResponse.ok) {
        const suggestionsData = await suggestionsResponse.json();
        setSuggestions(suggestionsData.data || []);
      }
    } catch (error) {
      console.error('Failed to load allocation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-error-600 bg-error-100 border-error-200';
      case 'high': return 'text-warning-600 bg-warning-100 border-warning-200';
      case 'medium': return 'text-warning-500 bg-warning-50 border-warning-200';
      case 'low': return 'text-primary-600 bg-primary-100 border-primary-200';
      default: return 'text-neutral-600 bg-neutral-100 border-neutral-200';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-success-600 bg-success-100';
    if (confidence >= 0.6) return 'text-warning-600 bg-warning-100';
    return 'text-error-600 bg-error-100';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-neutral-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="h-4 bg-neutral-200 rounded w-1/2 mb-4"></div>
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-neutral-200 rounded"></div>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="h-4 bg-neutral-200 rounded w-1/2 mb-4"></div>
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-neutral-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Resource Allocation</h1>
          <p className="mt-1 text-sm text-neutral-500">
            AI-powered resource suggestions and conflict resolution
          </p>
        </div>

        <div className="mt-4 sm:mt-0 flex space-x-3">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Select Project</option>
            <option value="project-1">Project Alpha</option>
            <option value="project-2">Project Beta</option>
            <option value="project-3">Project Gamma</option>
          </select>

          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Select Task</option>
            <option value="task-1">Frontend Development</option>
            <option value="task-2">Backend API</option>
            <option value="task-3">Database Design</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Suggestions */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-neutral-200">
            <div className="flex items-center">
              <Brain className="h-5 w-5 text-primary-600 mr-2" />
              <h3 className="text-lg font-medium text-neutral-900">AI Suggestions</h3>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Smart resource recommendations based on skills and availability
            </p>
          </div>

          <div className="p-6">
            {suggestions.length === 0 ? (
              <div className="text-center py-8">
                <Target className="mx-auto h-12 w-12 text-neutral-400" />
                <h3 className="mt-2 text-sm font-medium text-neutral-900">No suggestions</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Select a project and task to get AI-powered recommendations
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.userId}
                    className="border border-neutral-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h4 className="text-sm font-medium text-neutral-900">
                            {suggestion.userName}
                          </h4>
                          <span
                            className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}
                          >
                            {Math.round(suggestion.confidence * 100)}% match
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-neutral-600">
                          <div className="flex items-center">
                            <Target className="h-4 w-4 mr-1" />
                            <span>Skill: {Math.round(suggestion.skillMatch * 100)}%</span>
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            <span>Available: {Math.round(suggestion.availability * 100)}%</span>
                          </div>
                          <div className="flex items-center">
                            <DollarSign className="h-4 w-4 mr-1" />
                            <span>{formatCurrency(suggestion.cost)}</span>
                          </div>
                          <div className="flex items-center">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            <span>High confidence</span>
                          </div>
                        </div>

                        {suggestion.reasons.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-neutral-500 mb-1">Why this match:</p>
                            <ul className="text-xs text-neutral-600 space-y-1">
                              {suggestion.reasons.map((reason, index) => (
                                <li key={index} className="flex items-start">
                                  <span className="mr-1">•</span>
                                  <span>{reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="ml-4 flex space-x-2">
                        <button className="px-3 py-1 text-xs font-medium text-primary-600 hover:text-primary-500 border border-primary-300 rounded-md hover:bg-primary-50">
                          Assign
                        </button>
                        <button className="px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-500 border border-neutral-300 rounded-md hover:bg-neutral-50">
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Conflict Resolution */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-neutral-200">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-error-600 mr-2" />
              <h3 className="text-lg font-medium text-neutral-900">Active Conflicts</h3>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Resource allocation conflicts requiring attention
            </p>
          </div>

          <div className="p-6">
            {conflicts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="mx-auto h-12 w-12 text-success-400" />
                <h3 className="mt-2 text-sm font-medium text-neutral-900">No conflicts</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  All resource allocations are properly balanced
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {conflicts.map((conflict) => (
                  <div
                    key={conflict.id}
                    className="border border-neutral-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h4 className="text-sm font-medium text-neutral-900">
                            {conflict.userName}
                          </h4>
                          <span
                            className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(conflict.severity)}`}
                          >
                            {conflict.severity.toUpperCase()}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-neutral-600">
                          {conflict.totalAllocationPercentage.toFixed(1)}% allocation on{' '}
                          {new Date(conflict.conflictDate).toLocaleDateString()}
                        </p>

                        <div className="mt-2">
                          <p className="text-xs text-neutral-500 mb-1">Conflicting projects:</p>
                          <div className="flex flex-wrap gap-1">
                            {conflict.conflictingAllocations.map((allocation) => (
                              <span
                                key={allocation.id}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-800"
                              >
                                {allocation.projectName} ({allocation.allocationPercentage}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="ml-4 flex space-x-2">
                        <button className="px-3 py-1 text-xs font-medium text-primary-600 hover:text-primary-500 border border-primary-300 rounded-md hover:bg-primary-50">
                          Resolve
                        </button>
                        <button className="px-3 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-500 border border-neutral-300 rounded-md hover:bg-neutral-50">
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Allocation Matrix */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h3 className="text-lg font-medium text-neutral-900">Allocation Matrix</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Visual overview of resource allocations across projects
          </p>
        </div>

        <div className="p-6">
          <div className="h-64 flex items-center justify-center text-neutral-500">
            <div className="text-center">
              <Users className="mx-auto h-12 w-12 text-neutral-400" />
              <p className="mt-2">Allocation matrix visualization</p>
              <p className="text-sm">Integration with matrix component needed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
