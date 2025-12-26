"use client";

import React from 'react';

interface SettingsHeaderProps {
    title: string;
    description?: string;
}

export function SettingsHeader({ title, description, children }: SettingsHeaderProps & { children?: React.ReactNode }) {
    return (
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
                    {title}
                </h1>
                {description && (
                    <p className="text-base text-neutral-500 dark:text-neutral-400 mt-2">
                        {description}
                    </p>
                )}
            </div>
            {children && (
                <div className="flex-shrink-0">
                    {children}
                </div>
            )}
        </div>
    );
}

export default SettingsHeader;
