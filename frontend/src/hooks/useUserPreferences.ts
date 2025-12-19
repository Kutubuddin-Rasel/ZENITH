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
}

export interface NotificationPreferences {
    email: boolean;
    push: boolean;
    inApp: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
    types: NotificationTypes;
}

export interface UIPreferences {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    defaultView: 'board' | 'list' | 'timeline';
    itemsPerPage: number;
    showAdvancedFeatures: boolean;
    compactMode: boolean;
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

interface PreferencesResponse {
    success: boolean;
    data: UserPreferencesData;
}

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
        theme: 'auto',
        sidebarCollapsed: false,
        defaultView: 'board',
        itemsPerPage: 25,
        showAdvancedFeatures: false,
        compactMode: false,
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
        },
    },
    work: {
        workingHours: {
            start: '09:00',
            end: '17:00',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
 */
export function useUserPreferences() {
    return useQuery({
        queryKey: ['user-preferences'],
        queryFn: async (): Promise<UserPreferencesData> => {
            try {
                const response = await apiFetch<PreferencesResponse>('/user-preferences/me');
                return response.data || DEFAULT_PREFERENCES;
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
 */
export function useUpdatePreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (update: UpdatePreferencesPayload) => {
            return apiFetch<PreferencesResponse>('/user-preferences/me', {
                method: 'PATCH',
                body: JSON.stringify(update),
                headers: { 'Content-Type': 'application/json' },
            });
        },
        // Optimistic update for instant feedback
        onMutate: async (update) => {
            await queryClient.cancelQueries({ queryKey: ['user-preferences'] });
            const previousPrefs = queryClient.getQueryData<UserPreferencesData>(['user-preferences']);

            if (previousPrefs) {
                queryClient.setQueryData<UserPreferencesData>(['user-preferences'], {
                    ...previousPrefs,
                    ...update,
                    // Deep merge for nested objects
                    ui: { ...previousPrefs.ui, ...update.ui },
                    notifications: {
                        ...previousPrefs.notifications,
                        ...update.notifications,
                        types: {
                            ...previousPrefs.notifications?.types,
                            ...update.notifications?.types
                        },
                    },
                    work: {
                        ...previousPrefs.work,
                        ...update.work,
                        workingHours: {
                            ...previousPrefs.work?.workingHours,
                            ...update.work?.workingHours
                        },
                    },
                });
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
