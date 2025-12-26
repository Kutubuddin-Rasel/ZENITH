"use client";

import React, { ReactNode } from 'react';

interface SettingsCardProps {
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    headerAction?: ReactNode;
    variant?: 'default' | 'danger';
    className?: string;
}

export function SettingsCard({
    title,
    description,
    children,
    footer,
    headerAction,
    variant = 'default',
    className = ''
}: SettingsCardProps) {
    const isDanger = variant === 'danger';

    return (
        <div className={`
            border rounded-xl overflow-hidden transition-all duration-200
            ${isDanger
                ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm'
            }
            ${className}
        `}>
            {/* Header */}
            <div className={`
                p-6 border-b flex items-start justify-between gap-4
                ${isDanger
                    ? 'border-red-100 dark:border-red-900/30'
                    : 'border-neutral-100 dark:border-neutral-800'
                }
            `}>
                <div>
                    <h2 className={`
                        text-lg font-semibold
                        ${isDanger ? 'text-red-700 dark:text-red-400' : 'text-neutral-900 dark:text-white'}
                    `}>
                        {title}
                    </h2>
                    {description && (
                        <p className={`
                            text-sm mt-1
                            ${isDanger ? 'text-red-600/80 dark:text-red-300/80' : 'text-neutral-500'}
                        `}>
                            {description}
                        </p>
                    )}
                </div>
                {headerAction && (
                    <div className="flex-shrink-0">
                        {headerAction}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-6">
                {children}
            </div>

            {/* Footer (Optional) */}
            {footer && (
                <div className={`
                    px-6 py-4 flex items-center justify-end gap-3
                    ${isDanger
                        ? 'bg-red-100/50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30'
                        : 'bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-100 dark:border-neutral-800'
                    }
                `}>
                    {footer}
                </div>
            )}
        </div>
    );
}

export default SettingsCard;
