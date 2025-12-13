"use client";
import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

/**
 * ConflictModal - Handles 409 Conflict errors for optimistic locking
 * 
 * Shows when two users try to edit the same issue simultaneously.
 * Offers options to refresh (get latest) or force overwrite.
 */

export interface ConflictDetails {
    currentVersion: number;
    yourVersion: number;
    lastUpdated?: string;
    message?: string;
}

interface ConflictModalProps {
    open: boolean;
    onClose: () => void;
    onRefresh: () => void;
    onOverwrite?: () => void;
    conflict: ConflictDetails | null;
    isRefreshing?: boolean;
    isOverwriting?: boolean;
    resourceName?: string; // e.g., "issue", "comment"
}

const ConflictModal: React.FC<ConflictModalProps> = ({
    open,
    onClose,
    onRefresh,
    onOverwrite,
    conflict,
    isRefreshing = false,
    isOverwriting = false,
    resourceName = 'item',
}) => {
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'recently';
        try {
            return new Date(dateString).toLocaleString();
        } catch {
            return 'recently';
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Conflict Detected">
            <div className="flex flex-col gap-6">
                {/* Icon and Message */}
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/50">
                        <ExclamationCircleIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            This {resourceName} was modified by someone else
                        </h4>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            {conflict?.message || `Another user has made changes to this ${resourceName} while you were editing. 
              Your changes cannot be saved without potentially losing their updates.`}
                        </p>
                    </div>
                </div>

                {/* Version Info */}
                {conflict && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2 border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Your version:</span>
                            <span className="font-mono text-gray-700 dark:text-gray-300">v{conflict.yourVersion}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Current version:</span>
                            <span className="font-mono text-green-600 dark:text-green-400 font-semibold">v{conflict.currentVersion}</span>
                        </div>
                        {conflict.lastUpdated && (
                            <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
                                <span className="text-gray-500 dark:text-gray-400">Last updated:</span>
                                <span className="text-gray-700 dark:text-gray-300">{formatDate(conflict.lastUpdated)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isRefreshing || isOverwriting}
                    >
                        Cancel
                    </Button>

                    {onOverwrite && (
                        <Button
                            variant="danger"
                            onClick={onOverwrite}
                            loading={isOverwriting}
                            disabled={isRefreshing}
                        >
                            Overwrite Anyway
                        </Button>
                    )}

                    <Button
                        variant="primary"
                        onClick={onRefresh}
                        loading={isRefreshing}
                        disabled={isOverwriting}
                    >
                        <ArrowPathIcon className="h-4 w-4 mr-2" />
                        Refresh & Try Again
                    </Button>
                </div>

                {/* Help Text */}
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    Tip: Click &quot;Refresh&quot; to load the latest version, then re-apply your changes.
                </p>
            </div>
        </Modal>
    );
};

export default ConflictModal;

/**
 * Hook to handle 409 Conflict responses
 * 
 * Usage:
 * const { showConflict, conflictModal, handleApiError } = useConflictHandler();
 * 
 * try {
 *   await updateIssue(data);
 * } catch (error) {
 *   if (!handleApiError(error)) {
 *     // Handle other errors
 *   }
 * }
 * 
 * return (
 *   <>
 *     {conflictModal}
 *   </>
 * );
 */
export function useConflictHandler(options: {
    onRefresh: () => void | Promise<void>;
    onOverwrite?: () => void | Promise<void>;
    resourceName?: string;
}) {
    const [conflict, setConflict] = React.useState<ConflictDetails | null>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isOverwriting, setIsOverwriting] = React.useState(false);

    const handleApiError = (error: unknown): boolean => {
        // Check if it's a 409 Conflict
        const err = error as { status?: number; response?: { status?: number; data?: ConflictDetails } };
        const status = err.status || err.response?.status;

        if (status === 409) {
            const data = err.response?.data || err as ConflictDetails;
            setConflict({
                currentVersion: data.currentVersion || 0,
                yourVersion: data.yourVersion || 0,
                lastUpdated: data.lastUpdated,
                message: data.message,
            });
            return true;
        }
        return false;
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await options.onRefresh();
            setConflict(null);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleOverwrite = options.onOverwrite ? async () => {
        setIsOverwriting(true);
        try {
            await options.onOverwrite!();
            setConflict(null);
        } finally {
            setIsOverwriting(false);
        }
    } : undefined;

    const conflictModal = (
        <ConflictModal
            open={conflict !== null}
            onClose={() => setConflict(null)}
            onRefresh={handleRefresh}
            onOverwrite={handleOverwrite}
            conflict={conflict}
            isRefreshing={isRefreshing}
            isOverwriting={isOverwriting}
            resourceName={options.resourceName}
        />
    );

    return {
        showConflict: conflict !== null,
        conflictModal,
        handleApiError,
        clearConflict: () => setConflict(null),
    };
}
