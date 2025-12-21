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

// Fallback steps when backend returns empty
const FALLBACK_STEPS: OnboardingStep[] = [
  {
    stepId: 'welcome',
    title: 'Welcome to Zenith',
    description: 'Let\'s get you started with your project management journey. We\'ll guide you through the key features.',
    isCompleted: false,
    isSkipped: false,
    hints: ['Zenith helps you manage projects, sprints, and team collaboration', 'You can always access this guide from the user menu'],
    nextSteps: ['Set up your profile', 'Create your first project'],
    estimatedTime: 1,
  },
  {
    stepId: 'profile_setup',
    title: 'Set Up Your Profile',
    description: 'Complete your profile to help your team identify you and personalize your experience.',
    isCompleted: false,
    isSkipped: false,
    hints: ['Add a profile picture to make collaboration more personal', 'Set your timezone and preferences for better notifications'],
    nextSteps: ['Create a project', 'Explore the dashboard'],
    estimatedTime: 2,
  },
  {
    stepId: 'first_project',
    title: 'Create Your First Project',
    description: 'Projects are the foundation of Zenith. Create one to start organizing your work.',
    isCompleted: false,
    isSkipped: false,
    hints: ['Use descriptive names for easy identification', 'You can add team members after creation'],
    nextSteps: ['Add team members', 'Create your first issue'],
    estimatedTime: 3,
  },
  {
    stepId: 'team_invite',
    title: 'Invite Your Team',
    description: 'Collaboration is key. Invite team members to start working together.',
    isCompleted: false,
    isSkipped: false,
    hints: ['Assign roles to control access levels', 'Team members will receive an email invitation'],
    nextSteps: ['Create issues', 'Plan your first sprint'],
    estimatedTime: 2,
  },
  {
    stepId: 'issue_creation',
    title: 'Create Your First Issue',
    description: 'Issues help you track tasks, bugs, and features. Create one to see how it works.',
    isCompleted: false,
    isSkipped: false,
    hints: ['Use labels to categorize issues', 'Assign priority levels for better organization'],
    nextSteps: ['Plan a sprint', 'Use the board view'],
    estimatedTime: 2,
  },
  {
    stepId: 'board_view',
    title: 'Explore the Board View',
    description: 'The Kanban board gives you a visual overview of your work in progress.',
    isCompleted: false,
    isSkipped: false,
    hints: ['Drag and drop issues between columns', 'Customize columns to match your workflow'],
    nextSteps: ['Set up notifications', 'Explore reports'],
    estimatedTime: 2,
  },
];

interface OnboardingOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentStep?: string;
  steps: OnboardingStep[];
  onStepComplete?: (stepId: string) => void;
  onSkipStep: (stepId: string) => Promise<void>;
  onCompleteOnboarding: () => Promise<void>;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  isOpen,
  onClose,
  currentStep,
  steps,
  onStepComplete,
  onSkipStep,
  onCompleteOnboarding,
}) => {
  const router = useRouter();

  // Use fallback steps when backend returns empty
  const activeSteps = steps.length > 0 ? steps : FALLBACK_STEPS;

  // We use props for steps now, but we track index locally for UI flow
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading] = useState(false); // setLoading unused
  const [error, setError] = useState<string>('');
  const [showCelebration, setShowCelebration] = useState(false);

  // Track when we've made local (optimistic) updates to prevent useEffect from overriding
  const localUpdateRef = React.useRef(false);

  // Sync currentStepIndex with prop currentStep - but only when no local updates pending
  useEffect(() => {
    // Skip sync if we just made a local update (optimistic update in progress)
    if (localUpdateRef.current) {
      console.log('Skipping sync - local update in progress');
      localUpdateRef.current = false; // Reset after skipping once
      return;
    }

    if (currentStep && activeSteps.length > 0) {
      const stepIndex = activeSteps.findIndex(step => step.stepId === currentStep);
      // Only update if valid and different to prevent jumps specific cases
      if (stepIndex !== -1 && activeSteps[stepIndex].stepId !== activeSteps[currentStepIndex]?.stepId) {
        console.log('Syncing from prop currentStep:', currentStep, '-> index:', stepIndex);
        setCurrentStepIndex(stepIndex);
      }
    }
  }, [currentStep, activeSteps, currentStepIndex]);

  // Removed redundant loadOnboardingSteps - simplified

  const completeStep = async (stepId: string) => {
    try {
      if (onStepComplete) {
        onStepComplete(stepId);
      }

      // Move to next step locally for smoothness, parent will eventually sync
      if (currentStepIndex < activeSteps.length - 1) {
        localUpdateRef.current = true; // Prevent useEffect from overriding
        setCurrentStepIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to complete step:', err);
      setError('Failed to complete step');
    }
  };

  const skipStep = async (stepId: string) => {
    console.log('skipStep called with:', stepId, 'currentIndex:', currentStepIndex, 'activeSteps.length:', activeSteps.length);

    // Move to next step immediately (optimistic update)
    if (currentStepIndex < activeSteps.length - 1) {
      console.log('Setting step index to:', currentStepIndex + 1);
      localUpdateRef.current = true; // Prevent useEffect from overriding
      setCurrentStepIndex(prev => prev + 1);
    } else {
      console.log('Already at last step, cannot skip further');
    }

    // Try to sync with backend (non-blocking for fallback mode)
    try {
      await onSkipStep(stepId);
    } catch (err) {
      // Silently log - skip still works locally even if backend sync fails
      console.warn('Backend sync failed for skip step (fallback mode):', err);
    }
  };

  const completeOnboarding = async () => {
    // Show celebration immediately (optimistic update)
    setShowCelebration(true);

    // Try to sync with backend (non-blocking for fallback mode)
    try {
      await onCompleteOnboarding();
    } catch (err) {
      // Silently log - completion still works locally even if backend sync fails
      console.warn('Backend sync failed for complete onboarding (fallback mode):', err);
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

  if (!isOpen) return null;

  if (showCelebration) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-lg text-center p-8 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-10">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 transform rotate-12 scale-150" />
          </div>

          <div className="relative z-10">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckIcon className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>

            <h2 className="text-3xl font-bold text-neutral-900 dark:text-white mb-4">
              You&apos;re All Set!
            </h2>

            <p className="text-neutral-600 dark:text-neutral-400 mb-8 text-lg">
              Congratulations! You&apos;ve completed the onboarding. You&apos;re now ready to manage your projects like a pro with Zenith.
            </p>

            <Button
              size="lg"
              className="w-full"
              onClick={onClose}
            >
              Get Started
              <ArrowRightIcon className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentStepData = activeSteps[currentStepIndex];
  const isLastStep = currentStepIndex === activeSteps.length - 1;
  const completedSteps = activeSteps.filter(step => step.isCompleted).length;
  const totalSteps = activeSteps.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                Getting Started
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400">
                Let&apos;s get you up and running with Zenith
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Step {currentStepIndex + 1} of {totalSteps}
              </span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {completedSteps} completed
              </span>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
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
              <Button onClick={() => window.location.reload()}>
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
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
                    {currentStepData.title}
                  </h3>
                  <p className="text-neutral-600 dark:text-neutral-400">
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
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                  <h4 className="font-medium text-neutral-900 dark:text-white mb-2">
                    What&apos;s Next
                  </h4>
                  <ul className="space-y-1">
                    {currentStepData.nextSteps.map((nextStep, index) => (
                      <li key={index} className="text-sm text-neutral-600 dark:text-neutral-400">
                        • {nextStep}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Time Estimate */}
              <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <ClockIcon className="h-4 w-4" />
                Estimated time: {currentStepData.estimatedTime} minutes
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
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
                  type="button"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Skip clicked, moving to next step');
                    skipStep(currentStepData.stepId);
                  }}
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
            <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-neutral-900 dark:text-white">
                    Quick Action
                  </h4>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
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
