"use client";
import React from 'react';

// This script is injected into the <head> to prevent a flash of the wrong theme/accent.
// It should be as small as possible and run before any of your app's code.
const script = `
  (function() {
    try {
      var stored = localStorage.getItem('zenith-appearance');
      if (stored) {
        var settings = JSON.parse(stored);
        if (settings.theme === 'dark') {
          document.documentElement.classList.add('dark');
        }
        if (settings.compactMode) {
          document.documentElement.classList.add('compact');
        }
        if (settings.accentColor) {
          document.documentElement.style.setProperty('--accent-color', settings.accentColor);
          // Calculate foreground color based on luminance
          var hex = settings.accentColor.replace('#', '');
          var r = parseInt(hex.substring(0, 2), 16) / 255;
          var g = parseInt(hex.substring(2, 4), 16) / 255;
          var b = parseInt(hex.substring(4, 6), 16) / 255;
          var toLinear = function(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          var luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
          var foreground = luminance > 0.35 ? '#000000' : '#FFFFFF';
          document.documentElement.style.setProperty('--accent-foreground', foreground);
        }
      }
    } catch {
      // Ignore errors
    }
  })();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

