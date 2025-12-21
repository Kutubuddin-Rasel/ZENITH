"use client";

import React, { forwardRef, SelectHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

const selectVariants = cva(
    "w-full appearance-none rounded-md px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border outline-none placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
    {
        variants: {
            variant: {
                default: "border-neutral-300 dark:border-neutral-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900",
                error: "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:ring-offset-0",
            },
            fullWidth: {
                true: "w-full",
            },
        },
        defaultVariants: {
            variant: "default",
            fullWidth: true,
        },
    }
);

export interface SelectProps
    extends SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof selectVariants> {
    label?: string;
    error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({
    className,
    variant,
    fullWidth,
    label,
    error,
    children,
    ...props
}, ref) => {
    const effectiveVariant = error ? 'error' : variant;

    return (
        <div className="w-full space-y-1.5">
            {label && (
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {label}
                </label>
            )}

            <div className="relative">
                <select
                    className={cn(
                        selectVariants({ variant: effectiveVariant, fullWidth, className }),
                        "pr-10" // Space for the icon
                    )}
                    ref={ref}
                    {...props}
                >
                    {children}
                </select>

                {/* Custom Chevron Icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                    <ChevronDownIcon className="h-4 w-4" />
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400 animate-slide-up">
                    {error}
                </p>
            )}
        </div>
    );
});

Select.displayName = "Select";

export default Select;
