"use client";
import React from 'react';

// This script is injected into the <head> to prevent a flash of the wrong theme.
// It should be as small as possible and run before any of your app's code.
const script = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {
      console.warn('Could not set theme from localStorage');
    }
  })();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
} 