"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../Card';
import Button from '../Button';
import { 
  CheckIcon, 
  ClockIcon, 
  UserGroupIcon,
  ChartBarIcon,
  CogIcon,
  BellIcon,
  DocumentTextIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  estimatedTime: number; // minutes
  category: string;
  priority: 'high' | 'medium' | 'low';
  action?: {
    label: string;
    path: string;
  };
}

interface GettingStartedChecklistProps {
  projectId?: string;
  onItemComplete?: (itemId: string) => void;
  onAllComplete?: () => void;
}

const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  projectId,
  onItemComplete,
  onAllComplete,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  const [items, setItems] = useState<ChecklistItem[]>([]);

  // Check if user has completed certain actions based on their data
  const checkUserCompletionStatus = useCallback((itemId: string): boolean => {
    if (!user) return false;
    
    switch (itemId) {
      case 'profile_setup':
        // Check if user has name and other profile info
        return !!(user.name && user.name !== 'User');
      case 'preferences':
        // This would need to be checked against user preferences API
        return false;
      case 'invite_team':
        // This would need to be checked against project members API
        return false;
      case 'create_first_issue':
        // This would need to be checked against issues API
        return false;
      case 'plan_sprint':
        // This would need to be checked against sprints API
        return false;
      case 'explore_board':
        // This would need to be checked against boards API
        return false;
      case 'setup_notifications':
        // This would need to be checked against notification settings
        return false;
      case 'explore_reports':
        // This would need to be checked against reports API
        return false;
      default:
        return false;
    }
  }, [user]);

  const loadChecklistItems = useCallback(async () => {
    try {
      setLoading(true);
      
      // Define default checklist items
      const defaultItems: ChecklistItem[] = [
        {
          id: 'profile_setup',
          title: 'Complete Your Profile',
          description: 'Add your photo, role, and skills to help your team know you better',
          icon: <UserGroupIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 3,
          category: 'Profile',
          priority: 'high',
          action: {
            label: 'Go to Profile',
            path: '/profile',
          },
        },
        {
          id: 'preferences',
          title: 'Set Your Preferences',
          description: 'Configure notifications, working hours, and display settings',
          icon: <CogIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 5,
          category: 'Settings',
          priority: 'high',
          action: {
            label: 'Open Settings',
            path: projectId ? `/projects/${projectId}/settings` : '/projects/settings',
          },
        },
        {
          id: 'invite_team',
          title: 'Invite Team Members',
          description: 'Add your team members and assign appropriate roles',
          icon: <UserGroupIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 10,
          category: 'Team',
          priority: 'high',
          action: {
            label: 'Invite Team',
            path: projectId ? `/projects/${projectId}/team` : '/projects',
          },
        },
        {
          id: 'create_first_issue',
          title: 'Create Your First Issue',
          description: 'Add your first task, bug, or story to get started',
          icon: <DocumentTextIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 5,
          category: 'Issues',
          priority: 'high',
          action: {
            label: 'Create Issue',
            path: projectId ? `/projects/${projectId}/issues` : '/projects',
          },
        },
        {
          id: 'plan_sprint',
          title: 'Plan Your First Sprint',
          description: 'Set up a sprint and add issues to organize your work',
          icon: <ChartBarIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 15,
          category: 'Sprints',
          priority: 'medium',
          action: {
            label: 'Plan Sprint',
            path: projectId ? `/projects/${projectId}/sprints` : '/projects',
          },
        },
        {
          id: 'explore_board',
          title: 'Explore the Board View',
          description: 'Learn how to use the visual board to manage your work',
          icon: <ChartBarIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 5,
          category: 'Boards',
          priority: 'medium',
          action: {
            label: 'View Board',
            path: projectId ? `/projects/${projectId}/boards` : '/projects',
          },
        },
        {
          id: 'setup_notifications',
          title: 'Configure Notifications',
          description: 'Set up how you want to receive updates and alerts',
          icon: <BellIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 3,
          category: 'Notifications',
          priority: 'medium',
          action: {
            label: 'Setup Notifications',
            path: '/notifications',
          },
        },
        {
          id: 'explore_reports',
          title: 'Check Out Reports',
          description: 'Discover analytics and reporting features to track progress',
          icon: <ChartBarIcon className="h-5 w-5" />,
          completed: false,
          estimatedTime: 10,
          category: 'Reports',
          priority: 'low',
          action: {
            label: 'View Reports',
            path: projectId ? `/projects/${projectId}/reports` : '/projects',
          },
        },
      ];

      // Map checklist items with user completion detection
      const mappedItems = defaultItems.map(item => {
        const userCompleted = checkUserCompletionStatus(item.id);
        return {
          ...item,
          completed: userCompleted,
        };
      });

      setItems(mappedItems);
    } catch (err) {
      console.error('Failed to load checklist items:', err);
      setError('Failed to load checklist items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, checkUserCompletionStatus]);

  useEffect(() => {
    loadChecklistItems();
  }, [loadChecklistItems]);

  const toggleItem = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const newCompleted = !item.completed;
    
    // Update local state immediately for better UX
    setItems(prev => prev.map(i => 
      i.id === itemId 
        ? { ...i, completed: newCompleted }
        : i
    ));

    // Progress is saved locally in state, which is sufficient for the UI
    // In a full implementation, this could be saved to localStorage or sent to backend

    onItemComplete?.(itemId);

    // Check if all items are completed
    const updatedItems = items.map(i => 
      i.id === itemId 
        ? { ...i, completed: newCompleted }
        : i
    );
    
    if (updatedItems.every(i => i.completed)) {
      onAllComplete?.();
    }
  };

  // const getPriorityColor = (priority: string) => {
  //   switch (priority) {
  //     case 'high': return 'text-red-600 dark:text-red-400';
  //     case 'medium': return 'text-yellow-600 dark:text-yellow-400';
  //     case 'low': return 'text-green-600 dark:text-green-400';
  //     default: return 'text-gray-600 dark:text-gray-400';
  //   }
  // };

  const getCategoryIcon = (category: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'Profile': <UserGroupIcon className="h-4 w-4" />,
      'Settings': <CogIcon className="h-4 w-4" />,
      'Team': <UserGroupIcon className="h-4 w-4" />,
      'Issues': <DocumentTextIcon className="h-4 w-4" />,
      'Sprints': <ChartBarIcon className="h-4 w-4" />,
      'Boards': <ChartBarIcon className="h-4 w-4" />,
      'Notifications': <BellIcon className="h-4 w-4" />,
      'Reports': <ChartBarIcon className="h-4 w-4" />,
    };
    return iconMap[category] || <CogIcon className="h-4 w-4" />;
  };

  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Button onClick={loadChecklistItems}>
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <SparklesIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Getting Started Checklist
          </h3>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <p className="text-gray-600 dark:text-gray-400">
            Complete these steps to get the most out of Zenith
          </p>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {completedCount} of {totalCount} completed
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Checklist Items by Category */}
      <div className="space-y-6">
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              {getCategoryIcon(category)}
              <h4 className="font-medium text-gray-900 dark:text-white">
                {category}
              </h4>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({categoryItems.filter(item => item.completed).length}/{categoryItems.length})
              </span>
            </div>
            
            <div className="space-y-2">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 border rounded-lg transition-all duration-200 ${
                    item.completed
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleItem(item.id)}
                      className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                        item.completed
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                      }`}
                    >
                      {item.completed && <CheckIcon className="h-3 w-3" />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-gray-600 dark:text-gray-400">
                          {item.icon}
                        </div>
                        <h5 className={`font-medium ${
                          item.completed 
                            ? 'text-green-900 dark:text-green-100 line-through' 
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {item.title}
                        </h5>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          item.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                          item.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        }`}>
                          {item.priority}
                        </span>
                      </div>
                      
                      <p className={`text-sm mb-2 ${
                        item.completed 
                          ? 'text-green-700 dark:text-green-300' 
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {item.description}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {item.estimatedTime} min
                          </div>
                        </div>
                        
                        {item.action && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (item.action?.path) {
                                router.push(item.action.path);
                              }
                            }}
                          >
                            {item.action.label}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Completion Message */}
      {completedCount === totalCount && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            <div>
              <h4 className="font-medium text-green-900 dark:text-green-100">
                Congratulations! 🎉
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                You&apos;ve completed all the getting started steps. You&apos;re now ready to manage projects like a pro!
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default GettingStartedChecklist;
