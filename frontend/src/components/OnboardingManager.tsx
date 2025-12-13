"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import useOnboardingProgress from '@/hooks/useOnboardingProgress';
import OnboardingOverlay from './OnboardingOverlay/OnboardingOverlay';

const ONBOARDING_DISMISSED_KEY = 'zenith_onboarding_dismissed';

export default function OnboardingManager() {
    const { user } = useAuth();
    const {
        progress,
        steps,
        loading,
        initializeOnboarding,
        isOnboardingCompleted,
        skipStep,
        completeOnboarding,
        updateStepProgress,
    } = useOnboardingProgress();

    // Check localStorage for dismissal state
    const getInitialDismissedState = () => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true';
    };

    const [isDismissed, setIsDismissed] = React.useState(getInitialDismissedState);
    const initAttempted = useRef(false);

    // Handle dismissal with localStorage persistence
    const handleDismiss = useCallback(() => {
        setIsDismissed(true);
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
    }, []);

    // Handle re-opening (called from UserMenu via custom event)
    const handleReopen = useCallback(() => {
        setIsDismissed(false);
        localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
    }, []);

    // Listen for custom event to re-open onboarding
    useEffect(() => {
        const handleReopenEvent = () => handleReopen();
        window.addEventListener('zenith:reopen-onboarding', handleReopenEvent);
        return () => window.removeEventListener('zenith:reopen-onboarding', handleReopenEvent);
    }, [handleReopen]);

    useEffect(() => {
        // Only attempt to initialize if:
        // 1. User is logged in
        // 2. Not currently loading
        // 3. No progress found (meaning new user)
        // 4. Initialization hasn't been attempted yet (to prevent loops)
        if (user && !loading && !progress && !initAttempted.current) {
            initAttempted.current = true;
            initializeOnboarding({
                userRole: user.isSuperAdmin ? 'admin' : 'user',
                // We can add more context here if available
            }).catch(err => {
                console.error('Auto-initialization of onboarding failed', err);
            });
        }
    }, [user, loading, progress, initializeOnboarding]);

    // Don't render anything if:
    // 1. User not logged in
    // 2. Onboarding is completed
    // 3. Overlay is manually dismissed
    // Note: We removed the !progress check to allow fallback steps to work
    if (!user || isOnboardingCompleted() || isDismissed) {
        return null;
    }

    return (
        <OnboardingOverlay
            isOpen={!isDismissed}
            onClose={handleDismiss}
            currentStep={progress?.currentStep}
            steps={steps}
            onSkipStep={async (stepId) => { await skipStep(stepId); }}
            onCompleteOnboarding={async () => { await completeOnboarding(); }}
            onStepComplete={(stepId) => updateStepProgress(stepId, 'completed')}
        />
    );
}
