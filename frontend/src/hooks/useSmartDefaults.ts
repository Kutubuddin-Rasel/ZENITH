"use client";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface SmartDefaultSuggestion {
  field: string;
  value: string | number | boolean | string[];
  confidence: number;
  reason: string;
  alternatives?: (string | number | boolean | string[])[];
}

interface UserBehaviorPattern {
  preferredIssueTypes: string[];
  commonAssignees: Record<string, string>;
  averageSprintVelocity: number;
  workingHours: { start: string; end: string };
  mostActiveDays: number[];
  preferredPriorities: string[];
}

export const useSmartDefaults = () => {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<SmartDefaultSuggestion[]>([]);
  const [behaviorPattern, setBehaviorPattern] = useState<UserBehaviorPattern | null>(null);
  const [loading, setLoading] = useState(false);

  // Get smart defaults for issue creation
  const getIssueDefaults = useCallback(async (projectId: string, context?: {
    issueType?: string;
    projectType?: string;
    teamMembers?: string[];
  }) => {
    if (!user) return [];

    try {
      setLoading(true);
      const response = await fetch('/api/smart-defaults/issue-defaults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          projectId,
          ...context,
        }),
      });

      if (!response.ok) throw new Error('Failed to get issue defaults');

      const data = await response.json();
      setSuggestions(data.data);
      return data.data;
    } catch (error) {
      console.error('Error getting issue defaults:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Get smart defaults for project creation
  const getProjectDefaults = useCallback(async (projectType: string) => {
    if (!user) return [];

    try {
      setLoading(true);
      const response = await fetch(`/api/smart-defaults/project-defaults/${projectType}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to get project defaults');

      const data = await response.json();
      setSuggestions(data.data);
      return data.data;
    } catch (error) {
      console.error('Error getting project defaults:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Learn from user behavior
  const learnFromBehavior = useCallback(async (action: string, context: Record<string, unknown>) => {
    if (!user) return;

    try {
      await fetch('/api/smart-defaults/learn-behavior', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          action,
          context,
          timestamp: new Date(),
        }),
      });
    } catch (error) {
      console.error('Error learning from behavior:', error);
    }
  }, [user]);

  // Get user behavior pattern
  const getBehaviorPattern = useCallback(async () => {
    if (!user) return null;

    try {
      const response = await fetch('/api/smart-defaults/behavior-pattern', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to get behavior pattern');

      const data = await response.json();
      setBehaviorPattern(data.data);
      return data.data;
    } catch (error) {
      console.error('Error getting behavior pattern:', error);
      return null;
    }
  }, [user]);

  // Auto-learn from common actions
  const trackAction = useCallback((action: string, context: Record<string, unknown>) => {
    learnFromBehavior(action, context);
  }, [learnFromBehavior]);

  // Get suggestion for a specific field
  const getSuggestion = useCallback((field: string): SmartDefaultSuggestion | null => {
    return suggestions.find(s => s.field === field) || null;
  }, [suggestions]);

  // Apply suggestion to form data
  const applySuggestions = useCallback((formData: Record<string, unknown>): Record<string, unknown> => {
    const updatedData = { ...formData };
    
    suggestions.forEach(suggestion => {
      if (suggestion.confidence > 0.6 && !updatedData[suggestion.field]) {
        updatedData[suggestion.field] = suggestion.value;
      }
    });

    return updatedData;
  }, [suggestions]);

  // Load behavior pattern on mount
  useEffect(() => {
    if (user) {
      getBehaviorPattern();
    }
  }, [user, getBehaviorPattern]);

  return {
    suggestions,
    behaviorPattern,
    loading,
    getIssueDefaults,
    getProjectDefaults,
    learnFromBehavior,
    getBehaviorPattern,
    trackAction,
    getSuggestion,
    applySuggestions,
  };
};

export default useSmartDefaults;
