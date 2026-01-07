import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  hover?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  onClick,
  hover = false,
  ...props
}) => {
  const baseClasses = 'rounded-xl transition-all duration-200 bg-card text-card-foreground';

  const variantClasses = {
    default: 'border border-border shadow-sm',
    elevated: 'shadow-md border-none', // Elevated cards typically don't need borders if shadow is enough, but adhering to system
    outlined: 'border border-border bg-transparent shadow-none',
  };

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-6', // Standard card padding increased to 24px (p-6) for airiness
    lg: 'p-8',
  };

  const hoverClasses = hover ? 'hover:shadow-lg transition-shadow cursor-pointer' : '';
  const clickableClasses = onClick ? 'cursor-pointer' : '';

  return (
    <div
      className={cn(
        baseClasses,
        variantClasses[variant],
        paddingClasses[padding],
        hoverClasses,
        clickableClasses,
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;