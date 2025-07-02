import React, { forwardRef, TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ label, error, className = '', ...props }, ref) => (
  <div className="w-full">
    {label && (
      <label className="block mb-2 font-semibold text-sm bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
        {label}
      </label>
    )}
    <div className="relative">
      <textarea
        ref={ref}
        className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm dark:text-white border-gray-200 dark:border-gray-700 transition-all duration-300 placeholder-gray-400 dark:placeholder-gray-500 hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 shadow-sm hover:shadow-md focus:shadow-lg resize-none ${error ? 'border-red-500 ring-red-500/50 dark:border-red-400' : ''} ${className}`}
        {...props}
      />
      {/* Decorative gradient overlay */}
      <div className={`absolute inset-0 rounded-xl bg-gradient-to-r from-blue-50/0 via-blue-50/5 to-purple-50/0 dark:from-blue-950/0 dark:via-blue-950/5 dark:to-purple-950/0 opacity-0 focus-within:opacity-100 transition-opacity duration-300 pointer-events-none ${error ? 'from-red-50/0 via-red-50/5 to-red-50/0 dark:from-red-950/0 dark:via-red-950/5 dark:to-red-950/0' : ''}`} />
    </div>
    {error && (
      <div className="mt-2 flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-full" />
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      </div>
    )}
  </div>
));

TextArea.displayName = 'TextArea';
export default TextArea; 