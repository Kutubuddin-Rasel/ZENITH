/**
 * Auth Tokens Module - In-Memory Token Storage
 *
 * Implements the modern SPA security pattern:
 * - Access token stored in memory (cleared on page close)
 * - Automatic refresh scheduling before token expiry
 * - Singleton pattern for access outside React component tree
 *
 * Security Benefits:
 * - XSS cannot steal persisted tokens (none exist)
 * - Token only accessible during page lifetime
 * - Automatic refresh minimizes re-login friction
 */

import { getCsrfToken } from './csrf';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Module-level singleton (survives React re-renders)
let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Callbacks for state changes
let onTokenChange: ((token: string | null) => void) | null = null;
let onAuthError: (() => void) | null = null;

/**
 * Get the current access token.
 * Returns null if not authenticated.
 */
export function getAccessToken(): string | null {
    return accessToken;
}

/**
 * Check if user is authenticated (has valid token).
 */
export function isAuthenticated(): boolean {
    return accessToken !== null;
}

/**
 * Store access token and schedule refresh.
 *
 * @param token - The JWT access token
 * @param expiresIn - Token lifetime in seconds (default: 900 = 15 min)
 */
export function setAccessToken(token: string, expiresIn: number = 900): void {
    accessToken = token;
    tokenExpiresAt = Date.now() + expiresIn * 1000;

    // Notify subscribers
    if (onTokenChange) {
        onTokenChange(token);
    }

    // Schedule refresh 1 minute before expiry
    scheduleRefresh(expiresIn - 60);
}

/**
 * Clear access token and cancel scheduled refresh.
 * Called on logout or auth failure.
 */
export function clearAccessToken(): void {
    accessToken = null;
    tokenExpiresAt = null;

    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = null;
    }

    // Notify subscribers
    if (onTokenChange) {
        onTokenChange(null);
    }
}

/**
 * Schedule automatic token refresh.
 *
 * @param delaySeconds - Seconds until refresh
 */
function scheduleRefresh(delaySeconds: number): void {
    // Cancel any existing scheduled refresh
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
    }

    // Don't schedule if delay is negative or zero
    if (delaySeconds <= 0) {
        // Token already expired or about to - refresh immediately
        refreshAccessToken();
        return;
    }

    refreshTimeoutId = setTimeout(() => {
        refreshAccessToken();
    }, delaySeconds * 1000);
}

/**
 * Refresh the access token using the HttpOnly refresh cookie.
 * CSRF token is read from cookie and sent as header.
 */
export async function refreshAccessToken(): Promise<boolean> {
    try {
        const csrfToken = getCsrfToken();

        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'GET',
            credentials: 'include', // Send HttpOnly refresh cookie
            headers: {
                ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
            },
        });

        if (!response.ok) {
            // Refresh failed - user needs to re-login
            clearAccessToken();
            if (onAuthError) {
                onAuthError();
            }
            return false;
        }

        const data = await response.json();

        if (data.access_token) {
            setAccessToken(data.access_token, data.expires_in || 900);
            return true;
        }

        return false;
    } catch (error) {
        console.error('[AuthTokens] Refresh failed:', error);
        clearAccessToken();
        if (onAuthError) {
            onAuthError();
        }
        return false;
    }
}

/**
 * Register callback for token changes.
 * Used by AuthContext to sync React state.
 */
export function onTokenChangeCallback(
    callback: (token: string | null) => void
): () => void {
    onTokenChange = callback;

    // Return unsubscribe function
    return () => {
        onTokenChange = null;
    };
}

/**
 * Register callback for auth errors.
 * Used to trigger logout/redirect on refresh failure.
 */
export function onAuthErrorCallback(callback: () => void): () => void {
    onAuthError = callback;

    // Return unsubscribe function
    return () => {
        onAuthError = null;
    };
}

/**
 * Get remaining time until token expires.
 * Returns -1 if no token or already expired.
 */
export function getTokenTimeRemaining(): number {
    if (!tokenExpiresAt) return -1;
    const remaining = tokenExpiresAt - Date.now();
    return remaining > 0 ? Math.floor(remaining / 1000) : -1;
}

/**
 * Attempt to restore session on page load using refresh cookie.
 * Called in AuthContext during initialization.
 */
export async function tryRestoreSession(): Promise<boolean> {
    // Try to get a new access token using the refresh cookie
    return refreshAccessToken();
}
