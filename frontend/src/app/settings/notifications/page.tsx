"use client";
import React from 'react';
import Card from '@/components/Card';
import Switch from '@/components/Switch';
import Spinner from '@/components/Spinner';
import { useToast } from '@/context/ToastContext';
import { useUserPreferences, useUpdatePreferences, NotificationTypes } from '@/hooks/useUserPreferences';
import {
    BellIcon,
    EnvelopeIcon,
    DevicePhoneMobileIcon,
    ChatBubbleLeftIcon,
    CheckCircleIcon,
    UserPlusIcon,
    RocketLaunchIcon,
    FlagIcon,
    PencilSquareIcon,
} from '@heroicons/react/24/outline';

/**
 * Notification Settings Page - Channel-First Layout (Linear Style)
 * 
 * Layout:
 * - Section 1: Email (Master Switch + Sub-toggles)
 * - Section 2: Push/In-App (Master Switch + Sub-toggles)
 * - Section 3: Frequency selector
 */
export default function NotificationsPage() {
    const { data: preferences, isLoading, isError } = useUserPreferences();
    const { mutate: updatePreferences } = useUpdatePreferences();
    const { showToast } = useToast();

    const handleToggle = (
        channel: 'email' | 'push' | 'inApp',
        value: boolean
    ) => {
        updatePreferences(
            { notifications: { [channel]: value } },
            {
                onSuccess: () => showToast(`${channel.charAt(0).toUpperCase() + channel.slice(1)} notifications ${value ? 'enabled' : 'disabled'}`, 'success'),
                onError: () => showToast('Failed to update preferences', 'error'),
            }
        );
    };

    const handleTypeToggle = (type: keyof NotificationTypes, value: boolean) => {
        if (!preferences?.notifications?.types) return;

        updatePreferences(
            {
                notifications: {
                    types: {
                        [type]: value
                    }
                }
            },
            {
                onSuccess: () => showToast('Notification preference saved', 'success'),
                onError: () => showToast('Failed to update preferences', 'error'),
            }
        );
    };

    const handleFrequencyChange = (frequency: 'immediate' | 'daily' | 'weekly') => {
        updatePreferences(
            { notifications: { frequency } },
            {
                onSuccess: () => showToast(`Notification frequency set to ${frequency}`, 'success'),
                onError: () => showToast('Failed to update preferences', 'error'),
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Spinner className="h-10 w-10" />
            </div>
        );
    }

    if (isError || !preferences) {
        return (
            <div className="text-center py-12 text-neutral-500">
                Failed to load notification preferences
            </div>
        );
    }

    const notificationTypes: { key: keyof NotificationTypes; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
        { key: 'issueAssigned', label: 'Issue Assigned', description: 'When an issue is assigned to you', icon: UserPlusIcon },
        { key: 'issueUpdated', label: 'Issue Updated', description: 'When an issue you\'re involved in is updated', icon: PencilSquareIcon },
        { key: 'commentAdded', label: 'New Comments', description: 'When someone comments on your issues', icon: ChatBubbleLeftIcon },
        { key: 'sprintStarted', label: 'Sprint Started', description: 'When a sprint you\'re in begins', icon: RocketLaunchIcon },
        { key: 'sprintCompleted', label: 'Sprint Completed', description: 'When a sprint is finished', icon: CheckCircleIcon },
        { key: 'projectInvited', label: 'Project Invited', description: 'When you\'re invited to a project', icon: FlagIcon },
    ];

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
                    Notification Settings
                </h1>
                <p className="text-neutral-500 mt-2">
                    Choose how and when you want to be notified.
                </p>
            </div>

            {/* Email Notifications */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <EnvelopeIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                                Email Notifications
                            </h2>
                            <p className="text-sm text-neutral-500">
                                Receive updates via email
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={preferences.notifications?.email ?? true}
                        onCheckedChange={(checked) => handleToggle('email', checked)}
                    />
                </div>

                {preferences.notifications?.email && (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 space-y-3">
                        {notificationTypes.map(({ key, label, description, icon: Icon }) => (
                            <div key={key} className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-3">
                                    <Icon className="h-5 w-5 text-neutral-400" />
                                    <div>
                                        <p className="text-sm font-medium text-neutral-900 dark:text-white">{label}</p>
                                        <p className="text-xs text-neutral-500">{description}</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={preferences.notifications?.types?.[key] ?? true}
                                    onCheckedChange={(checked) => handleTypeToggle(key, checked)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Push/In-App Notifications */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <DevicePhoneMobileIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                                Push & In-App Notifications
                            </h2>
                            <p className="text-sm text-neutral-500">
                                Real-time updates in the app
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500">Push</span>
                            <Switch
                                checked={preferences.notifications?.push ?? true}
                                onCheckedChange={(checked) => handleToggle('push', checked)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500">In-App</span>
                            <Switch
                                checked={preferences.notifications?.inApp ?? true}
                                onCheckedChange={(checked) => handleToggle('inApp', checked)}
                            />
                        </div>
                    </div>
                </div>

                {(preferences.notifications?.push || preferences.notifications?.inApp) && (
                    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 space-y-3">
                        {notificationTypes.map(({ key, label, description, icon: Icon }) => (
                            <div key={key} className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-3">
                                    <Icon className="h-5 w-5 text-neutral-400" />
                                    <div>
                                        <p className="text-sm font-medium text-neutral-900 dark:text-white">{label}</p>
                                        <p className="text-xs text-neutral-500">{description}</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={preferences.notifications?.types?.[key] ?? true}
                                    onCheckedChange={(checked) => handleTypeToggle(key, checked)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Frequency Settings */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <BellIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                            Notification Frequency
                        </h2>
                        <p className="text-sm text-neutral-500">
                            How often to receive email digests
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    {(['immediate', 'daily', 'weekly'] as const).map((freq) => (
                        <button
                            key={freq}
                            onClick={() => handleFrequencyChange(freq)}
                            className={`p-4 rounded-xl border-2 text-center transition-all duration-200 ${preferences.notifications?.frequency === freq
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                }`}
                        >
                            <p className="font-medium capitalize">{freq}</p>
                            <p className="text-xs text-neutral-500 mt-1">
                                {freq === 'immediate' && 'As it happens'}
                                {freq === 'daily' && 'Once per day'}
                                {freq === 'weekly' && 'Weekly digest'}
                            </p>
                        </button>
                    ))}
                </div>
            </Card>
        </div>
    );
}
