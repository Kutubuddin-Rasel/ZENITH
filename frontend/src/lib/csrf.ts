/**
 * CSRF Token Module
 *
 * Reads CSRF token from cookie set by backend.
 * The token is set as a readable (non-HttpOnly) cookie during login/refresh.
 *
 * Usage:
 * - Read token: getCsrfToken()
 * - Include in requests: headers: { 'X-CSRF-Token': getCsrfToken() }
 *
 * Security:
 * - Prevents CSRF attacks on auth endpoints that use cookies
 * - Same-Origin Policy prevents attackers from reading this cookie
 */

/**
 * Get CSRF token from cookie.
 * Returns null if cookie not found.
 */
export function getCsrfToken(): string | null {
    if (typeof document === 'undefined') {
        // SSR - no document available
        return null;
    }

    const cookies = document.cookie.split(';');

    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrf_token') {
            return decodeURIComponent(value);
        }
    }

    return null;
}

/**
 * Check if CSRF token is available.
 */
export function hasCsrfToken(): boolean {
    return getCsrfToken() !== null;
}
