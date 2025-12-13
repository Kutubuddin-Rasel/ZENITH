/**
 * Chart Color Theme
 * Centralized color constants for Recharts components
 * Maps to Tailwind design system colors for consistency
 */

// Primary semantic colors (match Tailwind config)
export const chartColors = {
    // Primary brand color
    primary: '#3b82f6',       // primary-500
    primaryDark: '#2563eb',   // primary-600
    primaryLight: '#60a5fa',  // primary-400

    // Success/Positive
    success: '#22c55e',       // success-500
    successDark: '#16a34a',   // success-600
    successLight: '#4ade80',  // success-400

    // Warning
    warning: '#f59e0b',       // warning-500
    warningDark: '#d97706',   // warning-600
    warningLight: '#fbbf24',  // warning-400

    // Error/Danger
    error: '#ef4444',         // error-500
    errorDark: '#dc2626',     // error-600
    errorLight: '#f87171',    // error-400

    // Neutral (for axes, grids, secondary elements)
    neutral: '#9ca3af',       // neutral-400
    neutralDark: '#6b7280',   // neutral-500
    neutralLight: '#d1d5db',  // neutral-300

    // Grid and background
    grid: '#e5e7eb',          // neutral-200
    gridDark: '#374151',      // neutral-700 (for dark mode)

    // Additional chart-specific colors
    purple: '#8b5cf6',        // For variety in multi-series
    indigo: '#6366f1',
    cyan: '#06b6d4',
    pink: '#ec4899',
    orange: '#f97316',
    teal: '#14b8a6',
} as const;

// Pre-defined color palettes for multi-series charts
export const chartColorPalettes = {
    // Default palette for pie charts, bar charts with multiple series
    default: [
        chartColors.primary,
        chartColors.success,
        chartColors.warning,
        chartColors.error,
        chartColors.purple,
        chartColors.cyan,
    ],

    // Semantic palette (positive/negative/neutral)
    semantic: [
        chartColors.success,
        chartColors.warning,
        chartColors.error,
    ],

    // Cool tones
    cool: [
        chartColors.primary,
        chartColors.indigo,
        chartColors.purple,
        chartColors.cyan,
        chartColors.teal,
    ],

    // Warm tones
    warm: [
        chartColors.error,
        chartColors.orange,
        chartColors.warning,
        chartColors.pink,
    ],
} as const;

// Common chart styling
export const chartStyles = {
    // Tooltip styling
    tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '8px',
        border: 'none',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },

    // Dark mode tooltip
    tooltipDark: {
        backgroundColor: 'rgba(23, 23, 23, 0.95)',
        borderRadius: '8px',
        border: 'none',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
    },

    // Axis styling
    axis: {
        stroke: chartColors.neutral,
        fontSize: 12,
        tickLine: false,
        axisLine: false,
    },

    // Label styling
    label: {
        fill: chartColors.neutralDark,
    },
} as const;

export type ChartColor = keyof typeof chartColors;
export type ChartPalette = keyof typeof chartColorPalettes;
