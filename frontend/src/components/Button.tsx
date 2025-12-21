"use client";

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

// Simple Spinner Component for Button usage (inherits text color)
const ButtonSpinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("animate-spin", className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ring-offset-white dark:ring-offset-neutral-950",
  {
    variants: {
      variant: {
        primary: "bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 border border-transparent shadow-sm",
        secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 focus-visible:ring-neutral-500 border border-neutral-200 dark:border-neutral-700",
        ghost: "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 focus-visible:ring-neutral-500 border border-transparent",
        danger: "bg-error-600 text-white hover:bg-error-700 focus-visible:ring-error-500 border border-transparent shadow-sm",
        warning: "bg-warning-600 text-white hover:bg-warning-700 focus-visible:ring-warning-500 border border-transparent shadow-sm",
        success: "bg-success-600 text-white hover:bg-success-700 focus-visible:ring-success-500 border border-transparent shadow-sm",
        outline: "text-primary-600 border border-primary-200 hover:bg-primary-50 hover:border-primary-300 dark:text-primary-400 dark:border-primary-800 dark:hover:bg-primary-900/20 focus-visible:ring-primary-500 bg-transparent",
        gradient: "bg-gradient-to-r from-primary-600 to-purple-600 text-white hover:from-primary-700 hover:to-purple-700 border-transparent shadow-md focus-visible:ring-primary-500",
      },
      size: {
        xs: "px-2.5 py-1.5 text-xs gap-1.5",
        sm: "px-3 py-2 text-sm gap-2",
        md: "px-4 py-2.5 text-sm gap-2",
        lg: "px-5 py-3 text-base gap-2.5",
        xl: "px-6 py-4 text-lg gap-3",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "className" | "children">,
  VariantProps<typeof buttonVariants> {
  loading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  className,
  variant,
  size,
  fullWidth,
  loading = false,
  children,
  disabled,
  ...props
}, ref) => {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      className={cn(buttonVariants({ variant, size, fullWidth, className }))}
      disabled={loading || disabled}
      // Use standard button type by default to avoid form submission issues
      type={props.type || "button"}
      {...props}
    >
      {loading && <ButtonSpinner className="h-4 w-4" />}
      {children}
    </motion.button>
  );
});

Button.displayName = 'Button';

export default Button;