import React from 'react';

interface LabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

export default function Label({ children, htmlFor, className = '' }: LabelProps) {
  return (
    <label 
      htmlFor={htmlFor} 
      className={`block text-sm font-medium text-neutral-700 dark:text-neutral-300 ${className}`}
    >
      {children}
    </label>
  );
}
