"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';

interface ProgressiveDisclosureContextType {
  isSimpleMode: boolean;
  toggleMode: () => void;
  showAdvanced: (feature: string) => boolean;
  markFeatureUsed: (feature: string) => void;
  getUserExperienceLevel: () => 'beginner' | 'intermediate' | 'advanced';
  setUserExperienceLevel: (level: 'beginner' | 'intermediate' | 'advanced') => void;
  getFeatureUsage: (feature: string) => number;
  shouldShowHint: (feature: string) => boolean;
  dismissHint: (feature: string) => void;
}

const ProgressiveDisclosureContext = createContext<ProgressiveDisclosureContextType | undefined>(undefined);

export const useProgressiveDisclosure = () => {
  const context = useContext(ProgressiveDisclosureContext);
  if (!context) {
    throw new Error('useProgressiveDisclosure must be used within a ProgressiveDisclosureProvider');
  }
  return context;
};

interface ProgressiveDisclosureProviderProps {
  children: React.ReactNode;
}

export const ProgressiveDisclosureProvider: React.FC<ProgressiveDisclosureProviderProps> = ({ children }) => {
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const [featureUsage, setFeatureUsage] = useState<Record<string, number>>({});
  const [userExperienceLevel, setUserExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());

  // Load user preferences on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('zenith-ui-mode');
    const savedLevel = localStorage.getItem('zenith-experience-level');
    const savedUsage = localStorage.getItem('zenith-feature-usage');
    const savedHints = localStorage.getItem('zenith-dismissed-hints');

    if (savedMode) {
      setIsSimpleMode(savedMode === 'simple');
    }
    if (savedLevel) {
      setUserExperienceLevel(savedLevel as 'beginner' | 'intermediate' | 'advanced');
    }
    if (savedUsage) {
      setFeatureUsage(JSON.parse(savedUsage));
    }
    if (savedHints) {
      setDismissedHints(new Set(JSON.parse(savedHints)));
    }
  }, []);

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem('zenith-ui-mode', isSimpleMode ? 'simple' : 'advanced');
  }, [isSimpleMode]);

  useEffect(() => {
    localStorage.setItem('zenith-experience-level', userExperienceLevel);
  }, [userExperienceLevel]);

  useEffect(() => {
    localStorage.setItem('zenith-feature-usage', JSON.stringify(featureUsage));
  }, [featureUsage]);

  useEffect(() => {
    localStorage.setItem('zenith-dismissed-hints', JSON.stringify(Array.from(dismissedHints)));
  }, [dismissedHints]);

  const toggleMode = () => {
    setIsSimpleMode(prev => !prev);
  };

  const showAdvanced = (feature: string): boolean => {
    if (!isSimpleMode) return true;
    
    // Show advanced features based on usage
    const usage = featureUsage[feature] || 0;
    const experienceThreshold = userExperienceLevel === 'beginner' ? 5 : 
                               userExperienceLevel === 'intermediate' ? 3 : 1;
    
    return usage >= experienceThreshold;
  };

  const markFeatureUsed = (feature: string) => {
    setFeatureUsage(prev => ({
      ...prev,
      [feature]: (prev[feature] || 0) + 1
    }));
  };

  const getUserExperienceLevel = () => userExperienceLevel;

  const getFeatureUsage = (feature: string) => featureUsage[feature] || 0;

  const shouldShowHint = (feature: string): boolean => {
    if (dismissedHints.has(feature)) return false;
    
    const usage = featureUsage[feature] || 0;
    return usage < 3 && userExperienceLevel === 'beginner';
  };

  const dismissHint = (feature: string) => {
    setDismissedHints(prev => new Set([...prev, feature]));
  };

  const value: ProgressiveDisclosureContextType = {
    isSimpleMode,
    toggleMode,
    showAdvanced,
    markFeatureUsed,
    getUserExperienceLevel,
    setUserExperienceLevel,
    getFeatureUsage,
    shouldShowHint,
    dismissHint,
  };

  return (
    <ProgressiveDisclosureContext.Provider value={value}>
      {children}
    </ProgressiveDisclosureContext.Provider>
  );
};

export default ProgressiveDisclosureProvider;
