'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Card from '../Card';
import Button from '../Button';
import Modal from '../Modal';
import Spinner from '../Spinner';
import {
  StarIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';

interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  templateDefinition: Record<string, unknown>;
  metadata?: {
    version: string;
    author: string;
    category: string;
    tags: string[];
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedSetupTime: number;
    requiredPermissions: string[];
    compatibleProjects: string[];
    lastUpdated: string;
  };
  status: 'draft' | 'published' | 'archived' | 'private';
  isPublic: boolean;
  usageCount: number;
  rating?: number;
  reviewCount: number;
  tags?: string[];
  icon?: string;
  color?: string;
  previewImage?: string;
  instructions?: string;
  requirements?: string[];
  createdBy: string;
  reviews?: Array<{
    id: string;
    userId: string;
    userName: string;
    rating: number;
    comment: string;
    createdAt: string;
  }>;
  analytics?: {
    totalDownloads: number;
    successfulInstalls: number;
    averageSetupTime: number;
    commonCustomizations: string[];
    errorRate: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface WorkflowTemplatesMarketplaceProps {
  projectId: string;
  onTemplateSelected?: (template: WorkflowTemplate) => void;
}

export default function WorkflowTemplatesMarketplace({
  projectId,
  onTemplateSelected,
}: WorkflowTemplatesMarketplaceProps) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [featuredTemplates, setFeaturedTemplates] = useState<WorkflowTemplate[]>([]);
  const [, setPopularTemplates] = useState<WorkflowTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    category: 'all',
    complexity: 'all',
    minRating: 0,
    sortBy: 'popular',
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        ...(filters.search && { search: filters.search }),
        ...(filters.category !== 'all' && { category: filters.category }),
        ...(filters.complexity !== 'all' && { complexity: filters.complexity }),
        ...(filters.minRating > 0 && { minRating: filters.minRating.toString() }),
        isPublic: 'true',
        limit: '50',
      });

      const response = await fetch(`/api/workflow-templates?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setTemplates(result.data);
      } else {
        setError(result.error || 'Failed to load templates');
      }
    } catch (err) {
      console.error('Error loading templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTemplates();
    loadFeaturedTemplates();
    loadPopularTemplates();
    loadCategories();
  }, [loadTemplates]);

  const loadFeaturedTemplates = async () => {
    try {
      const response = await fetch('/api/workflow-templates/featured?limit=6', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setFeaturedTemplates(result.data);
      }
    } catch (err) {
      console.error('Error loading featured templates:', err);
    }
  };

  const loadPopularTemplates = async () => {
    try {
      const response = await fetch('/api/workflow-templates/popular?limit=6', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setPopularTemplates(result.data);
      }
    } catch (err) {
      console.error('Error loading popular templates:', err);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch('/api/workflow-templates/categories', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setCategories(result.data);
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };

  const createWorkflowFromTemplate = async (templateId: string) => {
    try {
      const response = await fetch(`/api/workflow-templates/${templateId}/create-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          projectId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        onTemplateSelected?.(result.data);
        return result.data;
      } else {
        setError(result.error || 'Failed to create workflow from template');
        return null;
      }
    } catch (err) {
      console.error('Error creating workflow from template:', err);
      setError('Failed to create workflow from template');
      return null;
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'simple':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'moderate':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'complex':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      'approval': '✅',
      'development': '💻',
      'marketing': '📢',
      'project-management': '📋',
      'customer-support': '🎧',
      'hr': '👥',
      'finance': '💰',
      'operations': '⚙️',
    };
    return icons[category] || '📄';
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i}>
        {i < Math.floor(rating) ? (
          <StarSolidIcon className="h-4 w-4 text-yellow-400" />
        ) : (
          <StarIcon className="h-4 w-4 text-neutral-300" />
        )}
      </span>
    ));
  };

  const TemplateCard = ({ template, featured = false }: { template: WorkflowTemplate; featured?: boolean }) => (
    <Card className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
      featured ? 'ring-2 ring-blue-500' : ''
    }`}>
      <div onClick={() => {
        setSelectedTemplate(template);
        setShowTemplateModal(true);
      }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getCategoryIcon(template.category)}</span>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-white">
                {template.name}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                by {template.metadata?.author || 'Unknown'}
              </p>
            </div>
          </div>
          {featured && (
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <SparklesIcon className="h-4 w-4" />
              <span className="text-xs font-medium">Featured</span>
            </div>
          )}
        </div>

        {template.description && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 line-clamp-2">
            {template.description}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400 mb-3">
          <div className="flex items-center gap-1">
            <StarIcon className="h-4 w-4" />
            <span>{template.rating?.toFixed(1) || 'N/A'}</span>
            <span>({template.reviewCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span>{template.usageCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <ClockIcon className="h-4 w-4" />
            <span>{template.metadata?.estimatedSetupTime || 0}m</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getComplexityColor(template.metadata?.complexity || 'simple')}`}>
              {template.metadata?.complexity || 'simple'}
            </span>
            {template.tags && template.tags.slice(0, 2).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {renderStars(template.rating || 0)}
          </div>
        </div>
      </div>
    </Card>
  );

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
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Workflow Templates
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Choose from pre-built workflow templates or create your own
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? 'List View' : 'Grid View'}
          </Button>
        </div>
      </div>

      {/* Featured Templates */}
      {featuredTemplates.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">
            Featured Templates
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} featured />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Search Templates
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
                placeholder="Search templates..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Complexity
            </label>
            <select
              value={filters.complexity}
              onChange={(e) => setFilters({ ...filters, complexity: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
            >
              <option value="all">All Levels</option>
              <option value="simple">Simple</option>
              <option value="moderate">Moderate</option>
              <option value="complex">Complex</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Sort By
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
            >
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">Newest</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex">
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

      {/* Templates Grid/List */}
      {templates.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <SparklesIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">
              No templates found
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Try adjusting your search criteria or browse all templates
            </p>
          </div>
        </Card>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          : 'space-y-4'
        }>
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}

      {/* Template Detail Modal */}
      {showTemplateModal && selectedTemplate && (
        <TemplateDetailModal
          template={selectedTemplate}
          onClose={() => {
            setShowTemplateModal(false);
            setSelectedTemplate(null);
          }}
          onUseTemplate={createWorkflowFromTemplate}
        />
      )}
    </div>
  );
}

// Template Detail Modal Component
function TemplateDetailModal({ 
  template, 
  onClose, 
  onUseTemplate 
}: { 
  template: WorkflowTemplate; 
  onClose: () => void; 
  onUseTemplate: (templateId: string) => Promise<WorkflowTemplate | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUseTemplate = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await onUseTemplate(template.id);
      if (result) {
        onClose();
      }
    } catch (err) {
      console.error('Error using template:', err);
      setError('Failed to create workflow from template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{template.icon || '📄'}</span>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {template.name}
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400">
                by {template.metadata?.author || 'Unknown'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i}>
                {i < Math.floor(template.rating || 0) ? (
                  <StarSolidIcon className="h-5 w-5 text-yellow-400" />
                ) : (
                  <StarIcon className="h-5 w-5 text-neutral-300" />
                )}
              </span>
            ))}
            <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">
              ({template.reviewCount} reviews)
            </span>
          </div>
        </div>

        {template.description && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              Description
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              {template.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {template.usageCount}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Downloads
            </div>
          </div>
          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {template.metadata?.estimatedSetupTime || 0}m
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Setup Time
            </div>
          </div>
          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {template.metadata?.complexity || 'simple'}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Complexity
            </div>
          </div>
          <div className="text-center p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {template.rating?.toFixed(1) || 'N/A'}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Rating
            </div>
          </div>
        </div>

        {template.tags && template.tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {template.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {template.instructions && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              Instructions
            </h3>
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-neutral-600 dark:text-neutral-400">
                {template.instructions}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleUseTemplate} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : 'Use Template'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
