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
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Legacy variant mapping for compatibility, upgrading to safe defaults
        success: "bg-success-600 text-white hover:bg-success-600/90",
        warning: "bg-warning-500 text-white hover:bg-warning-500/90",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        gradient: "bg-primary text-primary-foreground hover:bg-primary/90", // Fallback to primary for now
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        // Legacy size mapping
        xs: "h-8 px-2 text-xs",
        md: "h-10 px-4 py-2",
        xl: "h-12 rounded-md px-8 text-lg",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
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
      whileTap={{ scale: 0.98 }}
      className={cn(buttonVariants({ variant, size, fullWidth, className }))}
      disabled={loading || disabled}
      // Use standard button type by default to avoid form submission issues
      type={props.type || "button"}
      {...props}
    >
      {loading && <ButtonSpinner className="mr-2 h-4 w-4" />}
      {children}
    </motion.button>
  );
});

Button.displayName = 'Button';

export default Button;