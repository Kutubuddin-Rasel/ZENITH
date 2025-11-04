'use client';

import React, { useState } from 'react';
import { Users, Target, BarChart3, Brain, Settings, Calendar, DollarSign } from 'lucide-react';
import CapacityDashboard from '@/components/ResourceManagement/CapacityDashboard';
import ResourceAllocation from '@/components/ResourceManagement/ResourceAllocation';
import ResourceAnalytics from '@/components/ResourceManagement/ResourceAnalytics';

const tabs = [
  {
    id: 'capacity',
    name: 'Capacity Planning',
    icon: Calendar,
    description: 'Monitor team capacity and utilization',
  },
  {
    id: 'allocation',
    name: 'Resource Allocation',
    icon: Target,
    description: 'AI-powered resource suggestions',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    icon: BarChart3,
    description: 'Predictive insights and trends',
  },
  {
    id: 'skills',
    name: 'Skill Management',
    icon: Brain,
    description: 'Skill matching and development',
  },
  {
    id: 'costs',
    name: 'Cost Analysis',
    icon: DollarSign,
    description: 'Resource cost optimization',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: Settings,
    description: 'Resource management configuration',
  },
];

export default function ResourceManagementPage() {
  const [activeTab, setActiveTab] = useState('capacity');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'capacity':
        return <CapacityDashboard />;
      case 'allocation':
        return <ResourceAllocation />;
      case 'analytics':
        return <ResourceAnalytics />;
      case 'skills':
        return <SkillManagement />;
      case 'costs':
        return <CostAnalysis />;
      case 'settings':
        return <ResourceSettings />;
      default:
        return <CapacityDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Resource Management</h1>
              <p className="text-sm text-gray-500">
                Advanced resource planning and optimization
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        {renderTabContent()}
      </div>
    </div>
  );
}

// Placeholder components for other tabs
function SkillManagement() {
  return (
    <div className="p-6">
      <div className="text-center py-12">
        <Brain className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Skill Management</h3>
        <p className="mt-1 text-sm text-gray-500">
          Skill matching and development features coming soon
        </p>
      </div>
    </div>
  );
}

function CostAnalysis() {
  return (
    <div className="p-6">
      <div className="text-center py-12">
        <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Cost Analysis</h3>
        <p className="mt-1 text-sm text-gray-500">
          Resource cost optimization features coming soon
        </p>
      </div>
    </div>
  );
}

function ResourceSettings() {
  return (
    <div className="p-6">
      <div className="text-center py-12">
        <Settings className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Resource Settings</h3>
        <p className="mt-1 text-sm text-gray-500">
          Resource management configuration coming soon
        </p>
      </div>
    </div>
  );
}
