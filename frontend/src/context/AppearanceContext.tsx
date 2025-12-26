"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

/**
 * Appearance Settings
 * All settings that affect the visual appearance of the app
 */
export interface AppearanceSettings {
    theme: 'light' | 'dark';
    accentColor: string;        // Hex color
    compactMode: boolean;
    sidebarStyle: 'default' | 'compact';
}

const DEFAULT_SETTINGS: AppearanceSettings = {
    theme: 'light',
    accentColor: '#3B82F6',  // Tailwind Blue-500
    compactMode: false,
    sidebarStyle: 'default',
};

// Accent color palette for preset swatches
export const ACCENT_COLORS = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Teal', value: '#14B8A6' },
] as const;

interface AppearanceContextProps {
    settings: AppearanceSettings;
    setTheme: (theme: 'light' | 'dark') => void;
    setAccentColor: (color: string) => void;
    setCompactMode: (enabled: boolean) => void;
    setSidebarStyle: (style: 'default' | 'compact') => void;
    isLoading: boolean;
}

const AppearanceContext = createContext<AppearanceContextProps | undefined>(undefined);

/**
 * Apply theme to document
 */
function applyTheme(theme: 'light' | 'dark') {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

/**
 * Calculate relative luminance of a hex color
 * Uses WCAG formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * Returns value between 0 (black) and 1 (white)
 */
function getRelativeLuminance(hexColor: string): number {
    // Remove # if present
    const hex = hexColor.replace('#', '');

    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Apply sRGB to linear conversion
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    const rLinear = toLinear(r);
    const gLinear = toLinear(g);
    const bLinear = toLinear(b);

    // Calculate luminance
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Get the best foreground (text) color for a given background
 * Returns white for dark backgrounds, black for light backgrounds
 */
function getForegroundColor(hexBackground: string): string {
    const luminance = getRelativeLuminance(hexBackground);
    // Use 0.35 as threshold for better contrast on bright colors like orange
    return luminance > 0.35 ? '#000000' : '#FFFFFF';
}

/**
 * Apply accent color to CSS variables
 */
function applyAccentColor(hexColor: string) {
    const root = document.documentElement;
    root.style.setProperty('--accent-color', hexColor);

    // Calculate and set foreground color for accessibility (text ON accent background)
    const foreground = getForegroundColor(hexColor);
    root.style.setProperty('--accent-foreground', foreground);

    // Generate shades (simplified - in production use a proper color lib)
    root.style.setProperty('--accent-color-light', hexColor + '33');  // 20% opacity
    root.style.setProperty('--accent-color-dark', hexColor);
}

/**
 * Apply compact mode
 */
function applyCompactMode(enabled: boolean) {
    if (enabled) {
        document.documentElement.classList.add('compact');
    } else {
        document.documentElement.classList.remove('compact');
    }
}

/**
 * Apply sidebar style
 */
function applySidebarStyle(style: 'default' | 'compact') {
    const root = document.documentElement;
    if (style === 'compact') {
        root.classList.add('sidebar-compact');
    } else {
        root.classList.remove('sidebar-compact');
    }
}

/**
 * Load settings from localStorage
 */
function loadSettings(): AppearanceSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;

    try {
        const stored = localStorage.getItem('zenith-appearance');
        if (stored) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        }
    } catch {
        console.warn('Failed to load appearance settings from localStorage');
    }
    return DEFAULT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: AppearanceSettings) {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem('zenith-appearance', JSON.stringify(settings));
    } catch {
        console.warn('Failed to save appearance settings to localStorage');
    }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize from localStorage on mount
    useEffect(() => {
        const loaded = loadSettings();
        setSettings(loaded);

        // Apply all settings immediately
        applyTheme(loaded.theme);
        applyAccentColor(loaded.accentColor);
        applyCompactMode(loaded.compactMode);
        applySidebarStyle(loaded.sidebarStyle);

        setIsLoading(false);
    }, []);

    const setTheme = useCallback((theme: 'light' | 'dark') => {
        setSettings(prev => {
            const next = { ...prev, theme };
            applyTheme(theme);
            saveSettings(next);
            return next;
        });
    }, []);

    const setAccentColor = useCallback((color: string) => {
        setSettings(prev => {
            const next = { ...prev, accentColor: color };
            applyAccentColor(color);
            saveSettings(next);
            return next;
        });
    }, []);

    const setCompactMode = useCallback((enabled: boolean) => {
        setSettings(prev => {
            const next = { ...prev, compactMode: enabled };
            applyCompactMode(enabled);
            saveSettings(next);
            return next;
        });
    }, []);

    const setSidebarStyle = useCallback((style: 'default' | 'compact') => {
        setSettings(prev => {
            const next = { ...prev, sidebarStyle: style };
            applySidebarStyle(style);
            saveSettings(next);
            return next;
        });
    }, []);

    return (
        <AppearanceContext.Provider
            value={{
                settings,
                setTheme,
                setAccentColor,
                setCompactMode,
                setSidebarStyle,
                isLoading,
            }}
        >
            {children}
        </AppearanceContext.Provider>
    );
}

export function useAppearance() {
    const ctx = useContext(AppearanceContext);
    if (!ctx) {
        throw new Error('useAppearance must be used within AppearanceProvider');
    }
    return ctx;
}
