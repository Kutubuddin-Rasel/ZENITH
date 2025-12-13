import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Content Security Policy Middleware
 * 
 * Implements CSP headers with nonce support for scripts and styles.
 * 
 * Development Mode: Uses Report-Only to avoid breaking the app while logging violations
 * Production Mode: Can be switched to enforced CSP (see CSP_REPORT_ONLY constant)
 */

// Set to false in production to enforce CSP
const CSP_REPORT_ONLY = process.env.NODE_ENV === 'development';

/**
 * Generate a random nonce for CSP
 * Note: This nonce must be passed to inline scripts/styles that need to execute
 */
function generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('base64');
}

/**
 * Build CSP directives
 */
function buildCSP(nonce: string): string {
    const directives: Record<string, string[]> = {
        'default-src': ["'self'"],
        'script-src': [
            "'self'",
            `'nonce-${nonce}'`,
            // Allow Next.js to eval in development
            process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : '',
        ].filter(Boolean),
        'style-src': [
            "'self'",
            `'nonce-${nonce}'`,
            // Required for React inline styles and Next.js CSS injection
            "'unsafe-inline'",
        ],
        'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://ui-avatars.com',
            'https://gravatar.com',
            'https://www.gravatar.com',
            'https://avatars.githubusercontent.com',
        ],
        'connect-src': [
            "'self'",
            'http://localhost:3000', // Backend API
            'ws://localhost:3000',   // WebSocket for notifications
            process.env.NODE_ENV === 'development' ? 'ws://localhost:3001' : '', // HMR
        ].filter(Boolean),
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': [],
    };

    // Remove upgrade-insecure-requests in development
    if (process.env.NODE_ENV === 'development') {
        delete directives['upgrade-insecure-requests'];
    }

    return Object.entries(directives)
        .map(([key, values]) => {
            if (values.length === 0 && key === 'upgrade-insecure-requests') {
                return key;
            }
            return `${key} ${values.join(' ')}`;
        })
        .filter(directive => !directive.endsWith(' '))
        .join('; ');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function middleware(_request: NextRequest) {
    const nonce = generateNonce();
    const csp = buildCSP(nonce);

    // Clone the response
    const response = NextResponse.next();

    // Set CSP header (report-only in development)
    const cspHeader = CSP_REPORT_ONLY
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';

    response.headers.set(cspHeader, csp);

    // Pass nonce to the page via custom header (for use in layout/components)
    response.headers.set('x-nonce', nonce);

    // Additional security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}

// Apply to all routes except static files and API
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
