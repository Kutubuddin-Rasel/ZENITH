import React, { useState, useEffect } from 'react';

export interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error';
  onClose?: () => void;
  duration?: number;
}

const typeStyles = {
  info: 'bg-primary-500 border-primary-600',
  success: 'bg-success-500 border-success-600',
  error: 'bg-error-500 border-error-600',
};

const typeIcons = {
  info: 'ℹ️',
  success: '✅',
  error: '❌',
};

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration = 4000 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Animate in
    setIsVisible(true);

    // Progress bar animation
    const startTime = Date.now();
    const endTime = startTime + duration;

    const progressInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const newProgress = (remaining / duration) * 100;
      setProgress(newProgress);

      if (remaining <= 0) {
        clearInterval(progressInterval);
      }
    }, 10);

    return () => {
      clearInterval(progressInterval);
    };
  }, [duration]);

  return (
    <div
      className={`
        fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white border-l-4 
        ${typeStyles[type]} 
        transform transition-all duration-300 ease-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        max-w-sm min-w-[300px]
      `}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{typeIcons[type]}</span>
        <span className="flex-1 text-sm font-medium">{message}</span>
        {onClose && (
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose(), 300);
            }}
            className="text-white/80 hover:text-white font-bold text-lg leading-none p-1 rounded hover:bg-white/20 transition-colors"
            aria-label="Close notification"
          >
            ×
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/60 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default Toast; 