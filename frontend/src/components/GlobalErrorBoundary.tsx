"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';
import Card from './Card';
import { CardContent } from './CardComponents';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
                    <Card className="max-w-md w-full shadow-xl border-red-200 dark:border-red-900">
                        <CardContent className="p-8 text-center space-y-6">
                            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-500" />
                            </div>

                            <div className="space-y-2">
                                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                                    Something went wrong
                                </h1>
                                <p className="text-neutral-600 dark:text-neutral-400">
                                    We apologize for the inconvenience. An unexpected error has occurred.
                                </p>
                            </div>

                            {this.state.error && (
                                <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-left overflow-auto max-h-32 text-xs font-mono text-neutral-700 dark:text-neutral-300">
                                    {this.state.error.message}
                                </div>
                            )}

                            <Button
                                onClick={() => window.location.reload()}
                                className="w-full justify-center"
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reload Application
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
