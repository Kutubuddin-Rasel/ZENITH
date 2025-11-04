"use client";
import { useEffect } from 'react';
import { initializeSecurity } from '../lib/security';

export default function SecurityScript() {
  useEffect(() => {
    // Initialize security features
    initializeSecurity();

    // Additional security measures
    const handleBeforeUnload = () => {
      // Clear sensitive data on page unload
      sessionStorage.clear();
    };

    const handleVisibilityChange = () => {
      // Clear sensitive data when tab becomes hidden
      if (document.hidden) {
        // Optionally clear sensitive data when tab is hidden
        // sessionStorage.clear();
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
