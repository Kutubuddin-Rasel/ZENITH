"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../Card';
import Button from '../Button';
import Spinner from '../Spinner';
import { 
  CheckIcon, 
  XMarkIcon, 
  ArrowRightIcon,
  LightBulbIcon,
  ClockIcon,
  UserIcon,
  CogIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface OnboardingStep {
  stepId: string;
  title: string;
  description: string;
  isCompleted: boolean;
  isSkipped: boolean;
  hints: string[];
  nextSteps: string[];
  estimatedTime: number;
}

interface OnboardingOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentStep?: string;
  onStepComplete?: (stepId: string) => void;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  isOpen,
  onClose,
  currentStep,
  onStepComplete,
}) => {
  const router = useRouter();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadOnboardingSteps();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentStep && steps.length > 0) {
      const stepIndex = steps.findIndex(step => step.stepId === currentStep);
      if (stepIndex !== -1) {
        setCurrentStepIndex(stepIndex);
      }
    }
  }, [currentStep, steps]);

  const loadOnboardingSteps = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/onboarding/steps', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to load onboarding steps');
      
      const data = await response.json();
      setSteps(data.data);
    } catch (err) {
      console.error('Failed to load onboarding steps:', err);
      setError('Failed to load onboarding steps');
    } finally {
      setLoading(false);
    }
  };

  const completeStep = async (stepId: string) => {
    try {
      const response = await fetch(`/api/onboarding/step/${stepId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          status: 'completed',
        }),
      });

      if (!response.ok) throw new Error('Failed to complete step');

      // Update local state
      setSteps(prev => prev.map(step => 
        step.stepId === stepId 
          ? { ...step, isCompleted: true }
          : step
      ));

      onStepComplete?.(stepId);

      // Move to next step
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to complete step:', err);
      setError('Failed to complete step');
    }
  };

  const skipStep = async (stepId: string) => {
    try {
      const response = await fetch(`/api/onboarding/step/${stepId}/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          reason: 'User skipped',
        }),
      });

      if (!response.ok) throw new Error('Failed to skip step');

      // Update local state
      setSteps(prev => prev.map(step => 
        step.stepId === stepId 
          ? { ...step, isSkipped: true }
          : step
      ));

      // Move to next step
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to skip step:', err);
      setError('Failed to skip step');
    }
  };

  const completeOnboarding = async () => {
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to complete onboarding');

      onClose();
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setError('Failed to complete onboarding');
    }
  };

  const getStepIcon = (stepId: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'welcome': <UserIcon className="h-6 w-6" />,
      'profile_setup': <UserIcon className="h-6 w-6" />,
      'preferences': <CogIcon className="h-6 w-6" />,
      'first_project': <ChartBarIcon className="h-6 w-6" />,
      'team_invite': <UserIcon className="h-6 w-6" />,
      'issue_creation': <ChartBarIcon className="h-6 w-6" />,
      'sprint_planning': <ClockIcon className="h-6 w-6" />,
      'board_view': <ChartBarIcon className="h-6 w-6" />,
      'notifications': <CogIcon className="h-6 w-6" />,
      'reports': <ChartBarIcon className="h-6 w-6" />,
      'completed': <CheckIcon className="h-6 w-6" />,
    };
    return iconMap[stepId] || <CogIcon className="h-6 w-6" />;
  };

  const getStepAction = (stepId: string) => {
    const actionMap: Record<string, { label: string; path: string }> = {
      'profile_setup': { label: 'Go to Profile', path: '/profile' },
      'preferences': { label: 'Open Settings', path: '/projects/settings' },
      'first_project': { label: 'Create Project', path: '/projects' },
      'team_invite': { label: 'Invite Team', path: '/projects' },
      'issue_creation': { label: 'Create Issue', path: '/projects' },
      'sprint_planning': { label: 'Plan Sprint', path: '/projects' },
      'board_view': { label: 'View Board', path: '/projects' },
      'notifications': { label: 'Check Notifications', path: '/notifications' },
      'reports': { label: 'View Reports', path: '/projects' },
    };
    return actionMap[stepId];
  };

  if (!isOpen || steps.length === 0) return null;

  const currentStepData = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const completedSteps = steps.filter(step => step.isCompleted).length;
  const totalSteps = steps.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Getting Started
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Let&apos;s get you up and running with Zenith
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Step {currentStepIndex + 1} of {totalSteps}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {completedSteps} completed
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          {/* Current Step */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <Button onClick={loadOnboardingSteps}>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                  {getStepIcon(currentStepData.stepId)}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {currentStepData.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {currentStepData.description}
                  </p>
                </div>
              </div>

              {/* Hints */}
              {currentStepData.hints.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <LightBulbIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Pro Tips
                      </h4>
                      <ul className="space-y-1">
                        {currentStepData.hints.map((hint, index) => (
                          <li key={index} className="text-sm text-blue-800 dark:text-blue-200">
                            • {hint}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Next Steps */}
              {currentStepData.nextSteps.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                    What&apos;s Next
                  </h4>
                  <ul className="space-y-1">
                    {currentStepData.nextSteps.map((nextStep, index) => (
                      <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                        • {nextStep}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Time Estimate */}
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <ClockIcon className="h-4 w-4" />
                Estimated time: {currentStepData.estimatedTime} minutes
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              {currentStepIndex > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setCurrentStepIndex(prev => prev - 1)}
                >
                  Previous
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              {!isLastStep && (
                <Button
                  variant="ghost"
                  onClick={() => skipStep(currentStepData.stepId)}
                >
                  Skip
                </Button>
              )}
              
              {isLastStep ? (
                <Button onClick={completeOnboarding}>
                  Complete Onboarding
                  <CheckIcon className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={() => completeStep(currentStepData.stepId)}
                >
                  Mark Complete
                  <CheckIcon className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>

          {/* Quick Action */}
          {getStepAction(currentStepData.stepId) && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Quick Action
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {getStepAction(currentStepData.stepId)?.label}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    router.push(getStepAction(currentStepData.stepId)?.path || '/');
                    completeStep(currentStepData.stepId);
                  }}
                >
                  Go There
                  <ArrowRightIcon className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default OnboardingOverlay;
