/**
 * Frontend Security Configuration
 * Implements security best practices for the frontend
 */

// Content Security Policy configuration
export const CSP_CONFIG = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Note: unsafe-eval for development only
  'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  'font-src': ["'self'", "https://fonts.gstatic.com"],
  'img-src': ["'self'", "data:", "https:", "blob:"],
  'connect-src': ["'self'", "ws:", "wss:"],
  'media-src': ["'self'", "blob:"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

// Security headers for API requests
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Input sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

// XSS protection
export const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// CSRF token management
export const getCSRFToken = (): string | null => {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null;
};

// Secure storage for sensitive data
export const secureStorage = {
  setItem: (key: string, value: string): void => {
    try {
      // Use sessionStorage for sensitive data (cleared on tab close)
      sessionStorage.setItem(key, value);
    } catch (error) {
      console.error('Failed to store sensitive data:', error);
    }
  },
  
  getItem: (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error('Failed to retrieve sensitive data:', error);
      return null;
    }
  },
  
  removeItem: (key: string): void => {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove sensitive data:', error);
    }
  },
  
  clear: (): void => {
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('Failed to clear sensitive data:', error);
    }
  },
};

// Password strength validation
export const validatePasswordStrength = (password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    feedback.push('Password must contain at least one lowercase letter');
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push('Password must contain at least one uppercase letter');
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    feedback.push('Password must contain at least one number');
  } else {
    score += 1;
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    feedback.push('Password must contain at least one special character');
  } else {
    score += 1;
  }

  if (password.length >= 12) {
    score += 1;
  }

  return {
    isValid: score >= 4,
    score,
    feedback,
  };
};

// API request security
export const secureApiRequest = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = secureStorage.getItem('access_token');
  
  const secureOptions: RequestInit = {
    ...options,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json',
      'X-Request-ID': generateRequestId(),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    credentials: 'same-origin',
  };

  return fetch(url, secureOptions);
};

// Generate unique request ID
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Session timeout management
export class SessionManager {
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly timeoutDuration: number;

  constructor(timeoutMinutes: number = 30) {
    this.timeoutDuration = timeoutMinutes * 60 * 1000;
    this.resetTimeout();
    this.setupActivityListeners();
  }

  private resetTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = setTimeout(() => {
      this.handleTimeout();
    }, this.timeoutDuration);
  }

  private setupActivityListeners(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      document.addEventListener(event, () => {
        this.resetTimeout();
      }, true);
    });
  }

  private handleTimeout(): void {
    secureStorage.clear();
    window.location.href = '/auth/login?timeout=true';
  }

  public destroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}

// Initialize security features
export const initializeSecurity = (): void => {
  // Don't set X-Frame-Options via meta tags (it's not allowed)
  // Only set other security headers that can be set via meta tags
  Object.entries(SECURITY_HEADERS)
    .filter(([key]) => key !== 'X-Frame-Options') // Skip X-Frame-Options
    .forEach(([key, value]) => {
      document.head.insertAdjacentHTML('beforeend', `<meta http-equiv="${key}" content="${value}">`);
    });

  // Initialize session manager
  new SessionManager();

  // Add security event listeners
  window.addEventListener('beforeunload', () => {
    secureStorage.clear();
  });

  // Prevent right-click context menu in production
  if (process.env.NODE_ENV === 'production') {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }
};

// Export security utilities
const securityUtils = {
  CSP_CONFIG,
  SECURITY_HEADERS,
  sanitizeInput,
  escapeHtml,
  getCSRFToken,
  secureStorage,
  validatePasswordStrength,
  secureApiRequest,
  generateRequestId,
  SessionManager,
  initializeSecurity,
};

export default securityUtils;
