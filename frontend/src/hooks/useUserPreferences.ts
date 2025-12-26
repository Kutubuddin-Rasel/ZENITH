import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

// Types matching backend UserPreferencesData
export interface NotificationTypes {
    issueAssigned: boolean;
    issueUpdated: boolean;
    commentAdded: boolean;
    sprintStarted: boolean;
    sprintCompleted: boolean;
    projectInvited: boolean;
    // Enterprise: @mentions
    mentionedInComment: boolean;
    mentionedInDescription: boolean;
}

export interface NotificationPreferences {
    email: boolean;
    push: boolean;
    inApp: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
    types: NotificationTypes;
}

export interface UIPreferences {
    theme: 'light' | 'dark';
    accentColor: string;
    compactMode: boolean;
    sidebarStyle: 'default' | 'compact';
}

export interface WorkPreferences {
    workingHours: {
        start: string;
        end: string;
        timezone: string;
        workingDays: number[];
    };
    defaultSprintDuration: number;
    autoAssignToMe: boolean;
    enableTimeTracking: boolean;
    storyPointScale: number[];
}

export interface UserPreferencesData {
    ui: UIPreferences;
    notifications: NotificationPreferences;
    work: WorkPreferences;
    learning?: {
        preferredIssueTypes: string[];
        preferredPriorities: string[];
        commonAssigneePatterns: Record<string, string>;
        averageSprintVelocity: number;
        workingStyle: 'collaborative' | 'independent' | 'mixed';
        experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    };
    onboarding?: {
        completedSteps: string[];
        currentStep: string;
        isCompleted: boolean;
        completedAt?: string;
        skippedSteps: string[];
    };
}

// Note: apiFetch already unwraps { success, data } and returns just data

/**
 * Payload type for updating preferences - allows partial nested objects
 * This matches the backend's PATCH behavior where nested fields are merged
 */
export interface UpdatePreferencesPayload {
    ui?: Partial<UIPreferences>;
    notifications?: Omit<Partial<NotificationPreferences>, 'types'> & {
        types?: Partial<NotificationTypes>;
    };
    work?: Omit<Partial<WorkPreferences>, 'workingHours'> & {
        workingHours?: Partial<WorkPreferences['workingHours']>;
    };
}

const DEFAULT_PREFERENCES: UserPreferencesData = {
    ui: {
        theme: 'light',
        accentColor: '#3B82F6',
        compactMode: false,
        sidebarStyle: 'default',
    },
    notifications: {
        email: true,
        push: true,
        inApp: true,
        frequency: 'immediate',
        types: {
            issueAssigned: true,
            issueUpdated: true,
            commentAdded: true,
            sprintStarted: true,
            sprintCompleted: true,
            projectInvited: true,
            // Enterprise: @mentions
            mentionedInComment: true,
            mentionedInDescription: true,
        },
    },
    work: {
        workingHours: {
            start: '09:00',
            end: '17:00',
            timezone: 'UTC', // Static SSR-safe default - detect client-side
            workingDays: [1, 2, 3, 4, 5], // Mon-Fri
        },
        defaultSprintDuration: 14,
        autoAssignToMe: false,
        enableTimeTracking: false,
        storyPointScale: [1, 2, 3, 5, 8, 13],
    },
};


/**
 * Fetch current user's preferences
 * Note: apiFetch unwraps the API response and returns data directly
 */
export function useUserPreferences() {
    return useQuery({
        queryKey: ['user-preferences'],
        queryFn: async (): Promise<UserPreferencesData> => {
            try {
                // apiFetch already unwraps { success, data } - returns UserPreferencesData directly
                const preferences = await apiFetch<UserPreferencesData>('/user-preferences/me');
                return preferences || DEFAULT_PREFERENCES;
            } catch {
                // Return defaults if preferences don't exist yet
                return DEFAULT_PREFERENCES;
            }
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

/**
 * Update user preferences (partial update)
 * Fixed: Proper conditional deep merge for nested objects
 */
export function useUpdatePreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (update: UpdatePreferencesPayload) => {
            // apiFetch unwraps response - returns UserPreferencesData directly
            return apiFetch<UserPreferencesData>('/user-preferences/me', {
                method: 'PATCH',
                body: JSON.stringify(update),
                headers: { 'Content-Type': 'application/json' },
            });
        },
        // Optimistic update with conditional deep merge
        onMutate: async (update) => {
            await queryClient.cancelQueries({ queryKey: ['user-preferences'] });
            const previousPrefs = queryClient.getQueryData<UserPreferencesData>(['user-preferences']);

            if (previousPrefs) {
                const newData = { ...previousPrefs };

                // Conditional merge - only update if field provided
                if (update.ui) {
                    newData.ui = { ...previousPrefs.ui, ...update.ui };
                }

                if (update.notifications) {
                    // Handle nested types separately
                    const types = update.notifications.types
                        ? { ...previousPrefs.notifications.types, ...update.notifications.types }
                        : previousPrefs.notifications.types;

                    newData.notifications = {
                        ...previousPrefs.notifications,
                        ...update.notifications,
                        types,
                    };
                }

                if (update.work) {
                    // Handle nested workingHours separately
                    const workingHours = update.work.workingHours
                        ? { ...previousPrefs.work.workingHours, ...update.work.workingHours }
                        : previousPrefs.work.workingHours;

                    newData.work = {
                        ...previousPrefs.work,
                        ...update.work,
                        workingHours,
                    };
                }

                queryClient.setQueryData<UserPreferencesData>(['user-preferences'], newData);
            }

            return { previousPrefs };
        },
        onError: (_err, _update, context) => {
            // Rollback on error
            if (context?.previousPrefs) {
                queryClient.setQueryData(['user-preferences'], context.previousPrefs);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
        },
    });
}

