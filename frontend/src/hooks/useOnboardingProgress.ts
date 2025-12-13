"use client";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/fetcher';

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

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  isSkipped: boolean;
  completedAt?: string;
  skippedAt?: string;
  data?: Record<string, unknown>;
}

interface OnboardingProgress {
  id: string;
  userId: string;
  currentStep: string;
  steps: OnboardingStep[];
  isCompleted: boolean;
  completedAt?: string;
  context?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
}

export const useOnboardingProgress = () => {
  const { user } = useAuth();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Initialize onboarding for new user
  const initializeOnboarding = useCallback(async (context?: {
    projectType?: string;
    teamSize?: number;
    methodology?: string;
    userRole?: string;
  }) => {
    if (!user) return null;

    try {
      setLoading(true);
      const data = await apiFetch<{ success: boolean; data: OnboardingProgress }>('/api/onboarding/initialize', {
        method: 'POST',
        body: JSON.stringify(context),
      });

      setProgress(data.data);
      return data.data;
    } catch (error) {
      console.error('Failed to initialize onboarding:', error);
      setError('Failed to initialize onboarding');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Get current onboarding progress
  const getOnboardingProgress = useCallback(async () => {
    if (!user) return null;

    try {
      setLoading(true);
      const data = await apiFetch<{ success: boolean; data: OnboardingProgress }>('/api/onboarding/progress');
      setProgress(data.data);
      return data.data;
    } catch (error) {
      console.error('Failed to get onboarding progress:', error);
      setError('Failed to get onboarding progress');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Get onboarding steps
  const getOnboardingSteps = useCallback(async () => {
    if (!user) return [];

    try {
      setLoading(true);
      const data = await apiFetch<{ success: boolean; data: OnboardingStep[] }>('/api/onboarding/steps');
      setSteps(data.data);
      return data.data;
    } catch (error) {
      console.error('Failed to get onboarding steps:', error);
      setError('Failed to get onboarding steps');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Update step progress
  const updateStepProgress = useCallback(async (stepId: string, status: 'pending' | 'in_progress' | 'completed' | 'skipped', data?: Record<string, unknown>) => {
    if (!user) return null;

    try {
      const result = await apiFetch<{ success: boolean; data: OnboardingProgress }>(`/api/onboarding/step/${stepId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          data,
        }),
      });

      setProgress(result.data);
      return result.data;
    } catch (error) {
      console.error('Failed to update step progress:', error);
      setError('Failed to update step progress');
      return null;
    }
  }, [user]);

  // Skip a step
  const skipStep = useCallback(async (stepId: string, reason?: string) => {
    if (!user) return null;

    try {
      const result = await apiFetch<{ success: boolean; data: OnboardingProgress }>(`/api/onboarding/step/${stepId}/skip`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
        }),
      });

      setProgress(result.data);
      return result.data;
    } catch (error) {
      console.error('Failed to skip step:', error);
      setError('Failed to skip step');
      return null;
    }
  }, [user]);

  // Complete onboarding
  const completeOnboarding = useCallback(async () => {
    if (!user) return null;

    try {
      const result = await apiFetch<{ success: boolean; data: OnboardingProgress }>('/api/onboarding/complete', {
        method: 'POST',
      });

      setProgress(result.data);
      return result.data;
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      setError('Failed to complete onboarding');
      return null;
    }
  }, [user]);

  // Reset onboarding
  const resetOnboarding = useCallback(async () => {
    if (!user) return null;

    try {
      const result = await apiFetch<{ success: boolean; data: OnboardingProgress }>('/api/onboarding/reset', {
        method: 'POST',
      });

      setProgress(result.data);
      return result.data;
    } catch (error) {
      console.error('Failed to reset onboarding:', error);
      setError('Failed to reset onboarding');
      return null;
    }
  }, [user]);

  // Get completion percentage
  const getCompletionPercentage = useCallback(() => {
    if (!steps.length) return 0;
    const completedSteps = steps.filter(step => step.isCompleted).length;
    return Math.round((completedSteps / steps.length) * 100);
  }, [steps]);

  // Get next step
  const getNextStep = useCallback(() => {
    if (!steps.length) return null;
    return steps.find(step => !step.isCompleted && !step.isSkipped) || null;
  }, [steps]);

  // Check if onboarding is completed
  const isOnboardingCompleted = useCallback(() => {
    return progress?.isCompleted || false;
  }, [progress]);

  // Load progress and steps on mount
  useEffect(() => {
    if (user) {
      getOnboardingProgress();
      getOnboardingSteps();
    }
  }, [user, getOnboardingProgress, getOnboardingSteps]);

  return {
    progress,
    steps,
    loading,
    error,
    initializeOnboarding,
    getOnboardingProgress,
    getOnboardingSteps,
    updateStepProgress,
    skipStep,
    completeOnboarding,
    resetOnboarding,
    getCompletionPercentage,
    getNextStep,
    isOnboardingCompleted,
  };
};

export default useOnboardingProgress;
