"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import Toast from '../components/Toast';

interface ToastItem {
  id: number;
  message: string;
  type?: 'info' | 'success' | 'error';
  duration?: number;
}

interface ToastContextProps {
  showToast: (message: string, type?: 'info' | 'success' | 'error', duration?: number) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info', duration?: number) => {
    // Set default durations based on type (industry standard)
    let defaultDuration = 4000; // 4 seconds default
    if (type === 'error') {
      defaultDuration = 6000; // 6 seconds for errors (more important)
    } else if (type === 'success') {
      defaultDuration = 3000; // 3 seconds for success (quick feedback)
    } else if (type === 'info') {
      defaultDuration = 4000; // 4 seconds for info
    }

    const toastDuration = duration || defaultDuration;
    
    const newToast = { 
      id: Date.now() + Math.random(), 
      message, 
      type, 
      duration: toastDuration 
    };
    
    setToasts((prev) => [...prev, newToast]);
  };

  const removeToast = (id: number) => {
    // Clear the timer for this toast
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Set up auto-dismiss timers for new toasts
  useEffect(() => {
    toasts.forEach((toast) => {
      // Only set up timer if one doesn't already exist
      if (!timersRef.current.has(toast.id)) {
        const timer = setTimeout(() => {
          removeToast(toast.id);
        }, toast.duration || 4000);
        
        timersRef.current.set(toast.id, timer);
      }
    });

    // Cleanup function to clear all timers when component unmounts
    const currentTimers = timersRef.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col items-end space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
            duration={toast.duration}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
} 