import React from 'react';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'body-sm' | 'body-xs' | 'caption' | 'label' | 'label-sm';
  color?: 'primary' | 'secondary' | 'muted' | 'success' | 'warning' | 'error';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right' | 'justify';
  truncate?: boolean;
  lineClamp?: 1 | 2 | 3;
}

const Typography: React.FC<TypographyProps> = ({
  children,
  className = '',
  as,
  variant = 'body',
  color = 'primary',
  weight,
  align,
  truncate = false,
  lineClamp,
  ...props
}) => {
  // Determine the HTML element to render
  const Component = as || getDefaultElement(variant) as React.ElementType;
  
  // Base classes based on variant
  const variantClasses = {
    h1: 'text-3xl font-bold leading-tight tracking-tight',
    h2: 'text-2xl font-semibold leading-tight tracking-tight',
    h3: 'text-xl font-semibold leading-tight',
    h4: 'text-lg font-medium leading-tight',
    h5: 'text-base font-medium leading-tight',
    h6: 'text-sm font-medium leading-tight',
    body: 'text-base leading-relaxed',
    'body-sm': 'text-sm leading-relaxed',
    'body-xs': 'text-xs leading-relaxed',
    caption: 'text-xs font-medium uppercase tracking-wide',
    label: 'text-sm font-medium',
    'label-sm': 'text-xs font-medium',
  };
  
  // Color classes
  const colorClasses = {
    primary: 'text-neutral-900 dark:text-neutral-100',
    secondary: 'text-neutral-700 dark:text-neutral-300',
    muted: 'text-neutral-600 dark:text-neutral-400',
    success: 'text-success-700 dark:text-success-300',
    warning: 'text-warning-700 dark:text-warning-300',
    error: 'text-error-700 dark:text-error-300',
  };
  
  // Weight classes (override variant weight if specified)
  const weightClasses = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  };
  
  // Alignment classes
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
    justify: 'text-justify',
  };
  
  // Line clamp classes
  const lineClampClasses = {
    1: 'line-clamp-1',
    2: 'line-clamp-2',
    3: 'line-clamp-3',
  };
  
  // Build the class string
  const classes = [
    variantClasses[variant],
    colorClasses[color],
    weight && weightClasses[weight],
    align && alignClasses[align],
    truncate && 'text-truncate',
    lineClamp && lineClampClasses[lineClamp],
    className,
  ]
    .filter(Boolean)
    .join(' ');
  
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
};

// Helper function to determine default HTML element based on variant
function getDefaultElement(variant: string): keyof React.JSX.IntrinsicElements {
  switch (variant) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return variant as keyof React.JSX.IntrinsicElements;
    case 'body':
    case 'body-sm':
    case 'body-xs':
      return 'p';
    case 'caption':
    case 'label':
    case 'label-sm':
      return 'span';
    default:
      return 'div';
  }
}

export default Typography; 