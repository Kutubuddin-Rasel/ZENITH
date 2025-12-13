import { Skeleton } from '@/components/ui/skeleton';

export function KanbanSkeleton() {
    return (
        <div className="flex h-full gap-6 overflow-x-auto p-6">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-80 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-6 w-6 rounded-full" />
                    </div>
                    <div className="flex flex-col gap-3">
                        {Array.from({ length: 3 }).map((__, j) => (
                            <Skeleton key={j} className="h-32 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
