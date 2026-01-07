import { getAccessToken, refreshAccessToken } from './auth-tokens';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Simple API fetcher with Bearer token support
 *
 * Uses the same in-memory token pattern as api-client.ts
 * Handles 401 with automatic token refresh
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  isRetryAfterRefresh = false
): Promise<T> {
  const fullUrl = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

  // Build headers with Bearer token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // Add Authorization header if authenticated
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(fullUrl, {
    ...options,
    headers,
    credentials: 'include', // For HttpOnly cookies (refresh token)
  });

  // Handle 401 - attempt token refresh
  if (res.status === 401 && !isRetryAfterRefresh) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      // Retry original request with new token
      return apiFetch<T>(path, options, true);
    }

    // Refresh failed - throw to trigger login redirect
    throw new Error('Session expired. Please login again.');
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || res.statusText);
  }

  const json = await res.json();

  // Standardized API Response unwrapping
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    if (!json.success) {
      throw new Error(json.message || 'Operation failed');
    }
    return json.data as T;
  }

  // Fallback for non-standard responses
  return json as T;
}