"use client";
import React, { useMemo } from 'react';
import Card from '@/components/Card';
import Switch from '@/components/Switch';
import Spinner from '@/components/Spinner';
import Button from '@/components/Button';
import { useToast } from '@/context/ToastContext';
import { useUserPreferences, useUpdatePreferences } from '@/hooks/useUserPreferences';
import {
    SunIcon,
    MoonIcon,
    ComputerDesktopIcon,
    GlobeAltIcon,
    CalendarDaysIcon,
    ClockIcon,
    SparklesIcon,
    ViewColumnsIcon,
    Square2StackIcon,
    Bars3Icon,
} from '@heroicons/react/24/outline';

// Common timezones for quick selection
const COMMON_TIMEZONES = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Dhaka',
    'Australia/Sydney',
    'Pacific/Auckland',
];

/**
 * General Preferences Page
 * 
 * Features:
 * - Theme selection (Light | Dark | System)
 * - Timezone selector with "Detect My Timezone" button
 * - Start of Week (Sunday | Monday)
 * - Default View (Board | List | Timeline)
 * - Compact Mode toggle
 */
export default function PreferencesPage() {
    const { data: preferences, isLoading, isError } = useUserPreferences();
    const { mutate: updatePreferences } = useUpdatePreferences();
    const { showToast } = useToast();

    const detectedTimezone = useMemo(() => {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }, []);

    const handleThemeChange = (theme: 'light' | 'dark' | 'auto') => {
        updatePreferences(
            { ui: { theme } },
            {
                onSuccess: () => showToast(`Theme set to ${theme}`, 'success'),
                onError: () => showToast('Failed to update theme', 'error'),
            }
        );
    };

    const handleTimezoneChange = (timezone: string) => {
        updatePreferences(
            { work: { workingHours: { timezone } } },
            {
                onSuccess: () => showToast('Timezone updated', 'success'),
                onError: () => showToast('Failed to update timezone', 'error'),
            }
        );
    };

    const handleDetectTimezone = () => {
        handleTimezoneChange(detectedTimezone);
    };

    const handleStartOfWeekChange = (day: number) => {
        // Adjust working days based on start of week
        const workingDays = day === 0
            ? [1, 2, 3, 4, 5] // If Sunday start, Mon-Fri work
            : [1, 2, 3, 4, 5]; // If Monday start, Mon-Fri work

        updatePreferences(
            { work: { workingHours: { workingDays } } },
            {
                onSuccess: () => showToast(`Week starts on ${day === 0 ? 'Sunday' : 'Monday'}`, 'success'),
                onError: () => showToast('Failed to update preference', 'error'),
            }
        );
    };

    const handleDefaultViewChange = (view: 'board' | 'list' | 'timeline') => {
        updatePreferences(
            { ui: { defaultView: view } },
            {
                onSuccess: () => showToast(`Default view set to ${view}`, 'success'),
                onError: () => showToast('Failed to update preference', 'error'),
            }
        );
    };

    const handleCompactModeToggle = (enabled: boolean) => {
        updatePreferences(
            { ui: { compactMode: enabled } },
            {
                onSuccess: () => showToast(`Compact mode ${enabled ? 'enabled' : 'disabled'}`, 'success'),
                onError: () => showToast('Failed to update preference', 'error'),
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
            <div className="text-center py-12 text-gray-500">
                Failed to load preferences
            </div>
        );
    }

    const themeOptions = [
        { value: 'light' as const, label: 'Light', icon: SunIcon },
        { value: 'dark' as const, label: 'Dark', icon: MoonIcon },
        { value: 'auto' as const, label: 'System', icon: ComputerDesktopIcon },
    ];

    const viewOptions = [
        { value: 'board' as const, label: 'Board', icon: ViewColumnsIcon },
        { value: 'list' as const, label: 'List', icon: Bars3Icon },
        { value: 'timeline' as const, label: 'Timeline', icon: Square2StackIcon },
    ];

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    General Preferences
                </h1>
                <p className="text-gray-500 mt-2">
                    Customize your Zenith experience.
                </p>
            </div>

            {/* Appearance */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <SparklesIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Appearance
                        </h2>
                        <p className="text-sm text-gray-500">
                            Choose your preferred theme
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {themeOptions.map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => handleThemeChange(value)}
                            className={`p-4 rounded-xl border-2 text-center transition-all duration-200 flex flex-col items-center gap-2 ${preferences.ui?.theme === value
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <Icon className={`h-8 w-8 ${preferences.ui?.theme === value ? 'text-primary-600' : 'text-gray-400'}`} />
                            <span className={`font-medium ${preferences.ui?.theme === value ? 'text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {label}
                            </span>
                        </button>
                    ))}
                </div>
            </Card>

            {/* Timezone */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <GlobeAltIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Timezone
                            </h2>
                            <p className="text-sm text-gray-500">
                                Set your local timezone for accurate scheduling
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleDetectTimezone}
                        className="gap-2"
                    >
                        <ClockIcon className="h-4 w-4" />
                        Detect My Timezone
                    </Button>
                </div>

                <select
                    value={preferences.work?.workingHours?.timezone || detectedTimezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                >
                    <optgroup label="Common Timezones">
                        {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>
                                {tz.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </optgroup>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                    Detected: {detectedTimezone.replace(/_/g, ' ')}
                </p>
            </Card>

            {/* Week Start */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <CalendarDaysIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Start of Week
                        </h2>
                        <p className="text-sm text-gray-500">
                            Choose when your week begins
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {[
                        { value: 0, label: 'Sunday' },
                        { value: 1, label: 'Monday' },
                    ].map(({ value, label }) => {
                        // Check if first working day indicates start of week
                        const isSelected = value === 1; // Default to Monday start

                        return (
                            <button
                                key={value}
                                onClick={() => handleStartOfWeekChange(value)}
                                className={`p-4 rounded-xl border-2 text-center transition-all duration-200 ${isSelected
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                <span className="font-medium">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Default View */}
            <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                        <ViewColumnsIcon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Default View
                        </h2>
                        <p className="text-sm text-gray-500">
                            Choose your preferred project view
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {viewOptions.map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => handleDefaultViewChange(value)}
                            className={`p-4 rounded-xl border-2 text-center transition-all duration-200 flex flex-col items-center gap-2 ${preferences.ui?.defaultView === value
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <Icon className={`h-8 w-8 ${preferences.ui?.defaultView === value ? 'text-primary-600' : 'text-gray-400'}`} />
                            <span className={`font-medium ${preferences.ui?.defaultView === value ? 'text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {label}
                            </span>
                        </button>
                    ))}
                </div>
            </Card>

            {/* Compact Mode */}
            <Card className="p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <Square2StackIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Compact Mode
                            </h2>
                            <p className="text-sm text-gray-500">
                                Reduce spacing for more content on screen
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={preferences.ui?.compactMode ?? false}
                        onCheckedChange={handleCompactModeToggle}
                    />
                </div>
            </Card>
        </div>
    );
}
