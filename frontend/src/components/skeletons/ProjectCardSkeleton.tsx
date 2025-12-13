
import React from 'react';

export default function ProjectCardSkeleton() {
    return (
        <div className="h-full bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 flex flex-col overflow-hidden animate-pulse">
            <div className="p-6 flex-1 flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
                        <div className="space-y-2">
                            <div className="w-32 h-5 bg-neutral-200 dark:bg-neutral-700 rounded" />
                            <div className="w-16 h-3 bg-neutral-200 dark:bg-neutral-700 rounded" />
                        </div>
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-2 mb-6 flex-1">
                    <div className="w-full h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                    <div className="w-2/3 h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                </div>

                {/* Progress Section */}
                <div className="mt-auto">
                    <div className="flex justify-between items-end mb-2">
                        <div className="w-12 h-3 bg-neutral-200 dark:bg-neutral-700 rounded" />
                        <div className="w-8 h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5" />
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
                <div className="w-16 h-5 bg-neutral-200 dark:bg-neutral-700 rounded-full" />
            </div>
        </div>
    );
}
