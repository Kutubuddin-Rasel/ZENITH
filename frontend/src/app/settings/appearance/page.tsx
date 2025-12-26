"use client";
import React from 'react';
import { SettingsHeader, SettingsCard } from '@/components/settings-ui';
import Switch from '@/components/Switch';
import Spinner from '@/components/Spinner';
import { useToast } from '@/context/ToastContext';
import { useAppearance, ACCENT_COLORS } from '@/context/AppearanceContext';
import { useUserPreferences, useUpdatePreferences } from '@/hooks/useUserPreferences';
import {
    SunIcon,
    MoonIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/outline';

/**
 * Appearance Settings Page
 * 
 * All settings here apply IMMEDIATELY to the UI.
 * Features:
 * - Theme: Light / Dark (instantly applied)
 * - Accent Color: Color swatches (instantly applied)
 * - Compact Mode: Toggle (instantly applied)
 * - Sidebar Style: Default / Compact (instantly applied)
 */
export default function AppearancePage() {
    const { settings, setTheme, setAccentColor, setCompactMode, setSidebarStyle, isLoading } = useAppearance();
    useUserPreferences(); // Keep hook for side effects, but don't destructure unused data
    const { mutate: updatePreferences } = useUpdatePreferences();
    const { showToast } = useToast();

    // Sync settings to backend when changed
    const handleThemeChange = (theme: 'light' | 'dark') => {
        setTheme(theme);
        updatePreferences({ ui: { theme } }, {
            onSuccess: () => showToast(`Theme set to ${theme}`, 'success'),
            onError: () => showToast('Failed to save theme', 'error'),
        });
    };

    const handleAccentColorChange = (color: string) => {
        setAccentColor(color);
        updatePreferences({ ui: { accentColor: color } }, {
            onSuccess: () => showToast('Accent color updated', 'success'),
            onError: () => showToast('Failed to save accent color', 'error'),
        });
    };

    const handleCompactModeChange = (enabled: boolean) => {
        setCompactMode(enabled);
        updatePreferences({ ui: { compactMode: enabled } }, {
            onSuccess: () => showToast(`Compact mode ${enabled ? 'enabled' : 'disabled'}`, 'success'),
            onError: () => showToast('Failed to save preference', 'error'),
        });
    };

    const handleSidebarStyleChange = (style: 'default' | 'compact') => {
        setSidebarStyle(style);
        updatePreferences({ ui: { sidebarStyle: style } }, {
            onSuccess: () => showToast(`Sidebar set to ${style}`, 'success'),
            onError: () => showToast('Failed to save preference', 'error'),
        });
    };



    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Spinner className="h-10 w-10" />
            </div>
        );
    }

    const themeOptions = [
        { value: 'light' as const, label: 'Light', icon: SunIcon },
        { value: 'dark' as const, label: 'Dark', icon: MoonIcon },
    ];


    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <SettingsHeader
                title="Appearance"
                description="Customize how Zenith looks and feels for you."
            />

            {/* Theme */}
            <SettingsCard
                title="Theme"
                description="Choose your preferred interface theme."
            >
                <div className="grid grid-cols-2 gap-4">
                    {themeOptions.map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => handleThemeChange(value)}
                            className={`p-4 rounded-xl border-2 text-center transition-all duration-200 flex flex-col items-center gap-3 ${settings.theme === value
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                }`}
                        >
                            <Icon className={`h-8 w-8 ${settings.theme === value ? 'text-primary-600' : 'text-neutral-400'}`} />
                            <span className={`font-medium ${settings.theme === value ? 'text-primary-700 dark:text-primary-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                                {label}
                            </span>
                        </button>
                    ))}
                </div>
            </SettingsCard>

            {/* Accent Color */}
            <SettingsCard
                title="Accent Color"
                description="Choose your primary accent color."
            >
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {ACCENT_COLORS.map(({ name, value }) => (
                        <button
                            key={value}
                            onClick={() => handleAccentColorChange(value)}
                            className={`group relative p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-2 ${settings.accentColor === value
                                ? ''
                                : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                }`}
                            style={settings.accentColor === value ? { borderColor: value } : undefined}
                        >
                            <div
                                className="w-8 h-8 rounded-full shadow-md"
                                style={{ backgroundColor: value }}
                            />
                            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                                {name}
                            </span>
                            {settings.accentColor === value && (
                                <div
                                    className="absolute top-1 right-1 w-2 h-2 rounded-full"
                                    style={{ backgroundColor: value }}
                                />
                            )}
                        </button>
                    ))}
                </div>
            </SettingsCard>

            {/* Compact Mode */}
            <SettingsCard
                title="Compact Mode"
                description="Reduce spacing for a denser information display."
            >
                <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                            <Squares2X2Icon className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
                        </div>
                        <div>
                            <p className="font-medium text-neutral-900 dark:text-white">Enable Compact Mode</p>
                            <p className="text-sm text-neutral-500">Show more content with reduced spacing.</p>
                        </div>
                    </div>
                    <Switch
                        checked={settings.compactMode}
                        onCheckedChange={handleCompactModeChange}
                    />
                </div>
            </SettingsCard>

            {/* Sidebar Style */}
            <SettingsCard
                title="Sidebar Style"
                description="Choose your preferred sidebar layout."
            >
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleSidebarStyleChange('default')}
                        className={`p-4 rounded-xl border-2 text-center transition-all duration-200 ${settings.sidebarStyle === 'default'
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                            : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                            }`}
                    >
                        <span className="font-medium">Default</span>
                        <p className="text-xs text-neutral-500 mt-1">Full sidebar with labels</p>
                    </button>
                    <button
                        onClick={() => handleSidebarStyleChange('compact')}
                        className={`p-4 rounded-xl border-2 text-center transition-all duration-200 ${settings.sidebarStyle === 'compact'
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                            : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                            }`}
                    >
                        <span className="font-medium">Compact</span>
                        <p className="text-xs text-neutral-500 mt-1">Icons only, more space</p>
                    </button>
                </div>
            </SettingsCard>


        </div>
    );
}
