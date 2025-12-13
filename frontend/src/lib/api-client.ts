import { safeLocalStorage } from './safe-local-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface RequestOptions extends RequestInit {
    params?: Record<string, string>;
    skipRetry?: boolean;
}

interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: number; // Unix timestamp
}

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public rateLimit?: RateLimitInfo
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Parse rate limit headers from response
 */
function parseRateLimitHeaders(response: Response): RateLimitInfo | undefined {
    const limit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (limit && remaining && reset) {
        return {
            limit: parseInt(limit, 10),
            remaining: parseInt(remaining, 10),
            reset: parseInt(reset, 10),
        };
    }
    return undefined;
}

/**
 * Wait for specified milliseconds
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Core fetch wrapper with rate limiting and retry support
 */
async function fetchWrapper<T>(
    endpoint: string,
    options: RequestOptions = {},
    retryCount = 0
): Promise<T> {
    const { params, skipRetry, ...customConfig } = options;

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...customConfig.headers,
    };

    const config: RequestInit = {
        ...customConfig,
        headers,
        credentials: 'include', // Ensure HttpOnly cookies are sent
    };

    let url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                searchParams.append(key, value);
            }
        });
        const queryString = searchParams.toString();
        if (queryString) {
            url += `?${queryString}`;
        }
    }

    const response = await fetch(url, config);
    const rateLimit = parseRateLimitHeaders(response);

    // Handle rate limiting (429 Too Many Requests)
    if (response.status === 429 && !skipRetry && retryCount < MAX_RETRIES) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff

        if (process.env.NODE_ENV === 'development') {
            console.warn(`[API] Rate limited. Retrying in ${waitTime}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        }

        await delay(waitTime);
        return fetchWrapper<T>(endpoint, options, retryCount + 1);
    }

    if (!response.ok) {
        let errorMessage = 'An error occurred';
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
        } catch {
            // If response is not JSON, use status text
            errorMessage = response.statusText;
        }

        if (process.env.NODE_ENV === 'development') {
            console.error(`[API] ${response.status} ${errorMessage} - ${endpoint}`);
        }

        throw new ApiError(response.status, errorMessage, rateLimit);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return {} as T;
    }

    try {
        return await response.json();
    } catch {
        return {} as T;
    }
}

export const apiClient = {
    get: <T>(endpoint: string, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'GET' }),

    post: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),

    put: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),

    patch: <T>(endpoint: string, body: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

    delete: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
        fetchWrapper<T>(endpoint, { ...options, method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

