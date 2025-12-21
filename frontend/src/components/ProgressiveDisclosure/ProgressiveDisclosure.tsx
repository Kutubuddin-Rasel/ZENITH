"use client";
import React, { useState } from 'react';
import { useProgressiveDisclosure } from '../../context/ProgressiveDisclosureContext';
import { ChevronDownIcon, ChevronUpIcon, LightBulbIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ProgressiveDisclosureProps {
  children: React.ReactNode;
  feature: string;
  title?: string;
  description?: string;
  hint?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  collapsible?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

const ProgressiveDisclosure: React.FC<ProgressiveDisclosureProps> = ({
  children,
  feature,
  title,
  description,
  hint,
  level = 'intermediate',
  collapsible = false,
  defaultExpanded = false,
  className = '',
}) => {
  const { 
    showAdvanced, 
    markFeatureUsed, 
    getUserExperienceLevel, 
    shouldShowHint, 
    dismissHint 
  } = useProgressiveDisclosure();
  
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showHint, setShowHint] = useState(shouldShowHint(feature));

  const userLevel = getUserExperienceLevel();
  const shouldShow = showAdvanced(feature) || 
    (level === 'beginner') || 
    (level === 'intermediate' && userLevel !== 'beginner') ||
    (level === 'advanced' && userLevel === 'advanced');

  const handleInteraction = () => {
    markFeatureUsed(feature);
  };

  const handleDismissHint = () => {
    dismissHint(feature);
    setShowHint(false);
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <div 
      className={`progressive-disclosure ${className}`}
      onMouseEnter={handleInteraction}
      onClick={handleInteraction}
    >
      {/* Hint Banner */}
      {showHint && hint && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <LightBulbIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Pro Tip:</strong> {hint}
              </p>
            </div>
            <button
              onClick={handleDismissHint}
              className="text-blue-400 hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-100"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Header */}
      {collapsible && title && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 text-left bg-neutral-50 dark:bg-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
        >
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-white">{title}</h3>
            {description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{description}</p>
            )}
          </div>
          {isExpanded ? (
            <ChevronUpIcon className="h-5 w-5 text-neutral-500" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-neutral-500" />
          )}
        </button>
      )}

      {/* Content */}
      {(isExpanded || !collapsible) && (
        <div className={collapsible ? 'mt-4' : ''}>
          {children}
        </div>
      )}
    </div>
  );
};

export default ProgressiveDisclosure;
