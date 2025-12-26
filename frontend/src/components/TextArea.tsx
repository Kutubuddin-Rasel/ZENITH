"use client";

import React, { forwardRef, TextareaHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  "w-full rounded-xl px-4 py-3 text-sm font-normal bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border outline-none placeholder:text-neutral-500 placeholder:font-normal disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 min-h-[120px] shadow-sm",
  {
    variants: {
      variant: {
        default: "border-neutral-300 dark:border-neutral-600 focus:border-accent-blue focus:ring-2 focus:ring-accent-blue",
        error: "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:ring-offset-0",
      },
      fullWidth: {
        true: "w-full",
      },
      resize: {
        none: "resize-none",
        vertical: "resize-y",
        horizontal: "resize-x",
        both: "resize",
      },
    },
    defaultVariants: {
      variant: "default",
      fullWidth: true,
      resize: "vertical",
    },
  }
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
  VariantProps<typeof textareaVariants> {
  label?: string;
  error?: string;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  className,
  variant,
  fullWidth,
  resize,
  label,
  error,
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

      <textarea
        className={cn(textareaVariants({ variant: effectiveVariant, fullWidth, resize, className }))}
        ref={ref}
        {...props}
      />

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 animate-slide-up">
          {error}
        </p>
      )}
    </div>
  );
});

TextArea.displayName = "TextArea";

export default TextArea;