
import React from 'react';
import Card from '../Card';

export default function DashboardSkeleton() {
    return (
        <div className="space-y-8 animate-pulse">
            {/* Header Skeleton */}
            <Card className="p-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-neutral-200 dark:bg-neutral-700 rounded-xl" />
                        <div className="space-y-4 flex-1">
                            <div className="w-64 h-8 bg-neutral-200 dark:bg-neutral-700 rounded" />
                            <div className="w-96 h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-32 h-20 bg-neutral-200 dark:bg-neutral-700 rounded-xl" />
                        <div className="w-32 h-20 bg-neutral-200 dark:bg-neutral-700 rounded-xl" />
                    </div>
                </div>
            </Card>

            {/* Stats Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-neutral-200 dark:bg-neutral-700 rounded-xl" />
                            <div className="space-y-2">
                                <div className="w-16 h-6 bg-neutral-200 dark:bg-neutral-700 rounded" />
                                <div className="w-24 h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Chart & Feed Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8 h-80">
                    <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 rounded-xl" />
                </Card>
                <Card className="p-8 h-80">
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex gap-4">
                                <div className="w-10 h-10 bg-neutral-200 dark:bg-neutral-700 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                    <div className="w-full h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                                    <div className="w-2/3 h-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
