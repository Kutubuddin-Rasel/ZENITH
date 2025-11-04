'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Users, TrendingUp, AlertTriangle, Clock, Target } from 'lucide-react';

interface CapacityData {
  userCapacity: Array<{
    id: string;
    date: string;
    availableHours: number;
    allocatedHours: number;
    capacityPercentage: number;
    isWorkingDay: boolean;
  }>;
  utilization: {
    userId: string;
    date: string;
    availableHours: number;
    allocatedHours: number;
    utilizationPercentage: number;
    isOverallocated: boolean;
    conflicts: Array<{
      id: string;
      severity: string;
      description: string;
    }>;
  };
  summary: {
    totalDays: number;
    averageUtilization: number;
    overallocatedDays: number;
  };
}

interface CapacityDashboardProps {
  className?: string;
}

export default function CapacityDashboard({ className = '' }: CapacityDashboardProps) {
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [viewMode, setViewMode] = useState<'individual' | 'team'>('individual');

  useEffect(() => {
    loadCapacityData();
  }, [selectedPeriod, viewMode]);

  const loadCapacityData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/capacity-planning/dashboard', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setCapacityData(data.data);
      }
    } catch (error) {
      console.error('Failed to load capacity data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUtilizationColor = (percentage: number) => {
    if (percentage > 100) return 'text-red-600 bg-red-50';
    if (percentage > 80) return 'text-yellow-600 bg-yellow-50';
    if (percentage > 60) return 'text-green-600 bg-green-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!capacityData) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No capacity data</h3>
          <p className="mt-1 text-sm text-gray-500">Unable to load capacity information.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capacity Planning</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and optimize team resource allocation
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => setViewMode('individual')}
              className={`px-3 py-2 text-sm font-medium rounded-l-md border ${
                viewMode === 'individual'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setViewMode('team')}
              className={`px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                viewMode === 'team'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              Team
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Days</p>
              <p className="text-2xl font-semibold text-gray-900">
                {capacityData.summary.totalDays}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg Utilization</p>
              <p className="text-2xl font-semibold text-gray-900">
                {capacityData.summary.averageUtilization.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Overallocated Days</p>
              <p className="text-2xl font-semibold text-gray-900">
                {capacityData.summary.overallocatedDays}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Target className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Efficiency Score</p>
              <p className="text-2xl font-semibold text-gray-900">
                {Math.max(0, 100 - capacityData.summary.overallocatedDays * 5)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Capacity Calendar */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Capacity Calendar</h3>
          <p className="mt-1 text-sm text-gray-500">
            Daily capacity utilization for the selected period
          </p>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {capacityData.userCapacity.map((day) => (
              <div
                key={day.id}
                className={`p-3 rounded-lg text-center ${
                  !day.isWorkingDay
                    ? 'bg-gray-100 text-gray-400'
                    : getUtilizationColor(day.capacityPercentage)
                }`}
              >
                <div className="text-sm font-medium">
                  {new Date(day.date).getDate()}
                </div>
                <div className="text-xs mt-1">
                  {day.isWorkingDay ? `${day.capacityPercentage.toFixed(0)}%` : 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conflicts and Alerts */}
      {capacityData.utilization.conflicts.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Active Conflicts</h3>
            <p className="mt-1 text-sm text-gray-500">
              Resource allocation conflicts that need attention
            </p>
          </div>
          
          <div className="divide-y divide-gray-200">
            {capacityData.utilization.conflicts.map((conflict) => (
              <div key={conflict.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(conflict.severity)}`}
                    >
                      {conflict.severity.toUpperCase()}
                    </span>
                    <span className="ml-3 text-sm text-gray-900">
                      {conflict.description}
                    </span>
                  </div>
                  <button className="text-blue-600 hover:text-blue-500 text-sm font-medium">
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Utilization Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Utilization Trend</h3>
          <p className="mt-1 text-sm text-gray-500">
            Capacity utilization over time
          </p>
        </div>
        
        <div className="p-6">
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2">Chart visualization would go here</p>
              <p className="text-sm">Integration with charting library needed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
