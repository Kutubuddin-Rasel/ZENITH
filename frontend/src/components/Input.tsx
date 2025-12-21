"use client";

import React, { forwardRef, InputHTMLAttributes, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  "w-full rounded-md px-3 py-2 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
  {
    variants: {
      variant: {
        default: "border-neutral-300 dark:border-neutral-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900",
        error: "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:ring-offset-0",
        success: "border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:ring-offset-0",
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

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
  VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  success?: boolean;
  showPasswordToggle?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  className,
  variant,
  fullWidth,
  label,
  error,
  success,
  showPasswordToggle,
  type,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPasswordToggle && showPassword ? 'text' : type;

  // Determine effective variant based on state
  const effectiveVariant = error ? 'error' : success ? 'success' : variant;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
      )}

      <div className="relative group">
        <input
          type={inputType}
          className={cn(
            inputVariants({ variant: effectiveVariant, fullWidth, className }),
            // Add right padding if icons are present
            ((isPassword && showPasswordToggle) || success) && "pr-10"
          )}
          ref={ref}
          {...props}
        />

        {/* Password Toggle Button */}
        {isPassword && showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeSlashIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Success Checkmark */}
        {success && !isPassword && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 animate-slide-up">
          {error}
        </p>
      )}
    </div>
  );
});

Input.displayName = "Input";

export default Input;