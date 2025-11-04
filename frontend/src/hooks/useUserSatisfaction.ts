"use client";
import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface SatisfactionMetric {
  id: string;
  userId: string;
  metric: string;
  value: number;
  context: Record<string, unknown>;
  timestamp: Date;
}

interface SatisfactionSurvey {
  id: string;
  userId: string;
  type: 'onboarding' | 'feature' | 'general';
  questions: Array<{
    id: string;
    question: string;
    answer: number; // 1-5 scale
    context?: string;
  }>;
  overallScore: number;
  feedback?: string;
  timestamp: Date;
}

export const useUserSatisfaction = () => {
  const { user } = useAuth();
  const [metrics] = useState<SatisfactionMetric[]>([]);
  const [surveys, setSurveys] = useState<SatisfactionSurvey[]>([]);
  const [loading, setLoading] = useState(false);

  // Track a satisfaction metric
  const trackMetric = useCallback(async (metric: string, value: number, context: Record<string, unknown> = {}) => {
    if (!user) return;

    try {
      await fetch('/api/satisfaction/track-metric', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          metric,
          value,
          context,
          timestamp: new Date(),
        }),
      });
    } catch (error) {
      console.error('Error tracking satisfaction metric:', error);
    }
  }, [user]);

  // Submit a satisfaction survey
  const submitSurvey = useCallback(async (type: 'onboarding' | 'feature' | 'general', questions: Array<{
    id: string;
    question: string;
    answer: number;
    context?: string;
  }>, feedback?: string) => {
    if (!user) return null;

    try {
      setLoading(true);
      const overallScore = questions.reduce((sum, q) => sum + q.answer, 0) / questions.length;
      
      const response = await fetch('/api/satisfaction/submit-survey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          type,
          questions,
          overallScore,
          feedback,
          timestamp: new Date(),
        }),
      });

      if (!response.ok) throw new Error('Failed to submit survey');

      const data = await response.json();
      setSurveys(prev => [...prev, data.data]);
      return data.data;
    } catch (error) {
      console.error('Error submitting survey:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Track onboarding completion time
  const trackOnboardingTime = useCallback(async (startTime: Date, endTime: Date, stepsCompleted: number, stepsSkipped: number) => {
    const duration = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.round(duration / (1000 * 60));
    
    await trackMetric('onboarding_duration', durationMinutes, {
      stepsCompleted,
      stepsSkipped,
      totalSteps: stepsCompleted + stepsSkipped,
    });
  }, [trackMetric]);

  // Track project creation time
  const trackProjectCreationTime = useCallback(async (startTime: Date, endTime: Date, templateUsed: string, method: 'wizard' | 'manual') => {
    const duration = endTime.getTime() - startTime.getTime();
    const durationSeconds = Math.round(duration / 1000);
    
    await trackMetric('project_creation_duration', durationSeconds, {
      templateUsed,
      method,
    });
  }, [trackMetric]);

  // Track feature usage
  const trackFeatureUsage = useCallback(async (feature: string, context: Record<string, unknown> = {}) => {
    await trackMetric('feature_usage', 1, {
      feature,
      ...context,
    });
  }, [trackMetric]);

  // Track user satisfaction with a feature
  const trackFeatureSatisfaction = useCallback(async (feature: string, rating: number, feedback?: string) => {
    await trackMetric('feature_satisfaction', rating, {
      feature,
      feedback,
    });
  }, [trackMetric]);

  // Show satisfaction survey at appropriate times
  const shouldShowSurvey = useCallback((type: 'onboarding' | 'feature' | 'general'): boolean => {
    const lastSurvey = surveys.find(s => s.type === type);
    if (!lastSurvey) return true;
    
    const daysSinceLastSurvey = (new Date().getTime() - new Date(lastSurvey.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    
    switch (type) {
      case 'onboarding':
        return daysSinceLastSurvey >= 1; // Show after 1 day
      case 'feature':
        return daysSinceLastSurvey >= 7; // Show after 1 week
      case 'general':
        return daysSinceLastSurvey >= 30; // Show after 1 month
      default:
        return false;
    }
  }, [surveys]);

  // Get satisfaction score for a metric
  const getSatisfactionScore = useCallback((metric: string): number => {
    const metricData = metrics.filter(m => m.metric === metric);
    if (metricData.length === 0) return 0;
    
    const average = metricData.reduce((sum, m) => sum + m.value, 0) / metricData.length;
    return Math.round(average * 100) / 100;
  }, [metrics]);

  // Get overall satisfaction score
  const getOverallSatisfaction = useCallback((): number => {
    if (surveys.length === 0) return 0;
    
    const average = surveys.reduce((sum, s) => sum + s.overallScore, 0) / surveys.length;
    return Math.round(average * 100) / 100;
  }, [surveys]);

  // Track wizard completion
  const trackWizardCompletion = useCallback(async (duration: number, templateSelected: string, stepsCompleted: number) => {
    await trackMetric('wizard_completion', 1, {
      duration,
      templateSelected,
      stepsCompleted,
    });
  }, [trackMetric]);

  // Track user experience level progression
  const trackExperienceProgression = useCallback(async (fromLevel: string, toLevel: string, timeToProgression: number) => {
    await trackMetric('experience_progression', 1, {
      fromLevel,
      toLevel,
      timeToProgression,
    });
  }, [trackMetric]);

  return {
    metrics,
    surveys,
    loading,
    trackMetric,
    submitSurvey,
    trackOnboardingTime,
    trackProjectCreationTime,
    trackFeatureUsage,
    trackFeatureSatisfaction,
    shouldShowSurvey,
    getSatisfactionScore,
    getOverallSatisfaction,
    trackWizardCompletion,
    trackExperienceProgression,
  };
};

export default useUserSatisfaction;
