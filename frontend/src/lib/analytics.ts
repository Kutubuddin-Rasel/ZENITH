/**
 * Analytics utility for tracking user interactions
 * 
 * This is a simple implementation that stores events locally and logs them.
 * In production, replace sendEvent with calls to your analytics provider
 * (e.g., Mixpanel, Amplitude, PostHog, Google Analytics).
 */

interface AnalyticsEvent {
    name: string;
    properties?: Record<string, string | number | boolean>;
    timestamp: number;
}

// Store events in memory for the current session
const eventBuffer: AnalyticsEvent[] = [];

// LocalStorage key for persisting analytics
const ANALYTICS_STORAGE_KEY = 'zenith_analytics_events';

/**
 * Track an analytics event
 * @param name - Event name (e.g., 'wizard_step_completed')
 * @param properties - Additional event properties
 */
export function trackEvent(
    name: string,
    properties?: Record<string, string | number | boolean>
): void {
    const event: AnalyticsEvent = {
        name,
        properties: properties || {},
        timestamp: Date.now(),
    };

    // Add to buffer
    eventBuffer.push(event);

    // Log in development
    if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics]', name, properties);
    }

    // Persist to localStorage for reliability
    try {
        const existingEvents = localStorage.getItem(ANALYTICS_STORAGE_KEY);
        const events: AnalyticsEvent[] = existingEvents ? JSON.parse(existingEvents) : [];
        events.push(event);
        // Keep only the last 100 events to prevent storage bloat
        const trimmedEvents = events.slice(-100);
        localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(trimmedEvents));
    } catch {
        // localStorage may be full or disabled
    }

    // In production, send to analytics provider
    sendEvent(event);
}

/**
 * Send event to analytics provider
 * Replace this with your actual analytics implementation
 */

function sendEvent(event: AnalyticsEvent): void {
    // Acknowledge parameter until analytics provider is integrated
    void event;
    // TODO: Integrate with analytics provider
    // Example: mixpanel.track(event.name, event.properties);
    // Example: amplitude.logEvent(event.name, event.properties);
    // Example: posthog.capture(event.name, event.properties);
}

/**
 * Get all buffered events (useful for debugging)
 */
export function getBufferedEvents(): AnalyticsEvent[] {
    return [...eventBuffer];
}

/**
 * Get all persisted events from localStorage
 */
export function getPersistedEvents(): AnalyticsEvent[] {
    try {
        const saved = localStorage.getItem(ANALYTICS_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
}

/**
 * Clear all persisted events
 */
export function clearPersistedEvents(): void {
    try {
        localStorage.removeItem(ANALYTICS_STORAGE_KEY);
    } catch {
        // Ignore errors
    }
}

// Wizard-specific analytics events
export const WizardAnalytics = {
    /** Track when wizard is opened */
    wizardOpened: () => trackEvent('wizard_opened'),

    /** Track when a step is completed */
    stepCompleted: (stepIndex: number, stepId: string, totalSteps: number) =>
        trackEvent('wizard_step_completed', {
            stepIndex,
            stepId,
            totalSteps,
            progress: Math.round((stepIndex / totalSteps) * 100),
        }),

    /** Track when wizard is abandoned (closed without completing) */
    wizardAbandoned: (stepIndex: number, totalSteps: number) =>
        trackEvent('wizard_abandoned', {
            stepIndex,
            totalSteps,
            progress: Math.round((stepIndex / totalSteps) * 100),
        }),

    /** Track when template is selected */
    templateSelected: (templateId: string, templateName: string, isFallback: boolean) =>
        trackEvent('wizard_template_selected', {
            templateId,
            templateName,
            isFallback,
        }),

    /** Track when project is created */
    projectCreated: (templateId: string, totalTime: number, usedWizardApi: boolean) =>
        trackEvent('wizard_project_created', {
            templateId,
            totalTimeSeconds: totalTime,
            usedWizardApi,
        }),

    /** Track API errors */
    apiError: (endpoint: string, error: string) =>
        trackEvent('wizard_api_error', {
            endpoint,
            error,
        }),
};
