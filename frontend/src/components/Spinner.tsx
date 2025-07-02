import React from 'react';

const Spinner = ({ className = 'h-6 w-6' }: { className?: string }) => (
  <div className="relative">
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-label="Loading">
      <defs>
        <linearGradient id="spinnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="url(#spinnerGradient)" strokeWidth="4" />
      <path className="opacity-75" fill="url(#spinnerGradient)" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
    {/* Glow effect */}
    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-lg animate-pulse" />
  </div>
);

export default Spinner; 