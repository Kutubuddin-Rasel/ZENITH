import React from 'react';

export type BadgeVariant = 'default' | 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

interface StatusBadgeProps {
    children: React.ReactNode;
    variant?: BadgeVariant;
    size?: BadgeSize;
    className?: string;
    outline?: boolean;
}

const VARIANT_MAP: Record<BadgeVariant, string> = {
    default: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
    neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
};

const OUTLINE_MAP: Record<BadgeVariant, string> = {
    default: 'border-neutral-200 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300',
    neutral: 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400',
    primary: 'border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300',
    success: 'border-green-200 text-green-700 dark:border-green-800 dark:text-green-300',
    warning: 'border-yellow-200 text-yellow-700 dark:border-yellow-800 dark:text-yellow-300',
    danger: 'border-red-200 text-red-700 dark:border-red-800 dark:text-red-300',
    info: 'border-sky-200 text-sky-700 dark:border-sky-800 dark:text-sky-300',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    children,
    variant = 'default',
    size = 'sm',
    className = '',
    outline = false
}) => {
    const baseClasses = 'inline-flex items-center font-medium rounded-full';

    const sizeClasses = size === 'sm'
        ? 'px-2 py-0.5 text-xs'
        : 'px-2.5 py-0.5 text-sm';

    const colorClasses = outline ? `border ${OUTLINE_MAP[variant]}` : VARIANT_MAP[variant];

    // Map status strings to variants automatically if children is a known status string?
    // For now, keep it simple. Consumers choose the variant.

    return (
        <span className={`${baseClasses} ${sizeClasses} ${colorClasses} ${className}`}>
            {children}
        </span>
    );
};
