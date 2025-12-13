'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Route Error:', error);
    }, [error]);

    return (
        <div className="h-[50vh] flex flex-col items-center justify-center p-6 space-y-6">
            <div className="p-4 rounded-full bg-red-900/20 text-red-500">
                <AlertCircle size={48} />
            </div>
            <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Something went wrong!</h2>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                    {error.message || 'An unexpected error occurred while loading this page.'}
                </p>
            </div>
            <button
                onClick={() => reset()}
                className="px-4 py-2 bg-slate-800 text-slate-100 rounded hover:bg-slate-700"
            >
                Try again
            </button>
        </div>
    );
}
