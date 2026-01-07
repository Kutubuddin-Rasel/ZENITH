"use client";

import { toast } from "sonner";

/**
 * Premium Toast Hook
 * Enforces the "Behavior Policy" by restricting methods to semantic types.
 * 
 * Usage:
 * const { toast } = usePremiumToast();
 * toast.success("Project settings saved");
 */
export function usePremiumToast() {
    return {
        toast: {
            success: (message: string, description?: string) => {
                toast.success(message, {
                    description,
                });
            },
            error: (message: string, description?: string) => {
                toast.error(message, {
                    description,
                    duration: 5000, // Critical errors stay longer
                });
            },
            info: (message: string, description?: string) => {
                toast.info(message, {
                    description,
                });
            },
            warning: (message: string, description?: string) => {
                toast.warning(message, {
                    description,
                });
            },
            promise: <T>(
                promise: Promise<T>,
                data: {
                    loading: string;
                    success: (data: T) => string;
                    error: string;
                }
            ) => {
                return toast.promise(promise, {
                    loading: data.loading,
                    success: data.success,
                    error: data.error,
                });
            },
            // Restricted: No generic .message() or .custom() exposed to enforce consistency
            dismiss: (id?: string | number) => toast.dismiss(id),
        },
    };
}
