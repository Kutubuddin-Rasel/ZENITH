'use client';
import React, { forwardRef, InputHTMLAttributes, useState } from 'react';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  showPasswordToggle?: boolean;
  success?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  showPasswordToggle = false,
  success = false,
  className = '',
  type,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPasswordToggle && showPassword ? 'text' : type;

  return (
    <div className="w-full">
      {label && (
        <label className="block mb-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <div className="relative group">
        <input
          ref={ref}
          type={inputType}
          className={`w-full px-3.5 py-3 border rounded-xl bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none transition-all duration-200
            ${error
              ? 'border-error-500 focus:border-error-500 focus:ring-4 focus:ring-error-500/10'
              : success
                ? 'border-success-500 focus:border-success-500 focus:ring-4 focus:ring-success-500/10'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10'
            }
            ${(isPassword && showPasswordToggle) || success ? 'pr-12' : ''}
            focus:-translate-y-0.5 focus:shadow-lg focus:shadow-neutral-900/5 dark:focus:shadow-black/20
            ${className}`}
          {...props}
        />

        {/* Password Toggle Button */}
        {isPassword && showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Success Checkmark */}
        {success && !isPassword && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircleIcon className="h-5 w-5 text-success-500" />
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="mt-1.5 text-sm text-error-600 dark:text-error-400 flex items-center gap-1.5 animate-fade-in">
          <span className="inline-block w-1 h-1 rounded-full bg-error-500" />
          {error}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;