'use client';

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Global Error:', error);
    }, [error]);

    return (
        <html>
            <body className="bg-slate-900 text-slate-50 min-h-screen flex items-center justify-center">
                <div className="max-w-md text-center space-y-4 p-6">
                    <h2 className="text-2xl font-bold text-red-500">Critical System Error</h2>
                    <p className="text-slate-400">
                        Something went wrong at the application root. Please try refreshing.
                    </p>
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={() => reset()}
                            className="px-4 py-2 bg-slate-100 text-slate-900 rounded hover:bg-slate-200"
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 border border-slate-700 rounded hover:bg-slate-800"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
