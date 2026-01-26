/**
 * Frontend Configuration
 *
 * Centralized configuration for all frontend settings.
 * All API URLs and environment-specific values are managed here.
 *
 * Usage:
 *   import { config } from '@/lib/config';
 *   fetch(`${config.apiUrl}/endpoint`);
 */

/**
 * Environment type for type safety
 */
type Environment = 'development' | 'staging' | 'production' | 'test';

/**
 * Application configuration interface
 */
interface AppConfig {
    /**
     * Current environment
     */
    env: Environment;

    /**
     * Whether running in production
     */
    isProduction: boolean;

    /**
     * Backend API base URL
     * Example: http://localhost:3000 or https://api.example.com
     */
    apiUrl: string;

    /**
     * WebSocket URL for real-time connections
     * Example: ws://localhost:3000 or wss://api.example.com
     */
    wsUrl: string;

    /**
     * Frontend application URL (for social share, meta tags, etc.)
     */
    appUrl: string;

    /**
     * Feature flags
     */
    features: {
        /**
         * Enable AI-powered features
         */
        ai: boolean;

        /**
         * Enable analytics tracking
         */
        analytics: boolean;

        /**
         * Enable debug mode (extra logging)
         */
        debug: boolean;
    };

    /**
     * Timeouts (in milliseconds)
     */
    timeouts: {
        /**
         * Default API request timeout
         */
        api: number;

        /**
         * WebSocket reconnection timeout
         */
        wsReconnect: number;
    };
}

/**
 * Get WebSocket URL from API URL
 * Converts http(s) to ws(s)
 */
function getWsUrl(apiUrl: string): string {
    if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
    }
    return apiUrl.replace(/^http/, 'ws');
}

/**
 * Get current environment
 */
function getEnvironment(): Environment {
    const env = process.env.NEXT_PUBLIC_ENV || process.env.NODE_ENV || 'development';
    if (['development', 'staging', 'production', 'test'].includes(env)) {
        return env as Environment;
    }
    return 'development';
}

/**
 * Application configuration singleton
 *
 * All environment variables are read once at module load time.
 * This ensures consistency across the application.
 */
export const config: AppConfig = {
    env: getEnvironment(),

    isProduction: process.env.NODE_ENV === 'production',

    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',

    wsUrl: getWsUrl(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'),

    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001',

    features: {
        ai: process.env.NEXT_PUBLIC_FEATURE_AI !== 'false',
        analytics: process.env.NEXT_PUBLIC_FEATURE_ANALYTICS === 'true',
        debug: process.env.NEXT_PUBLIC_DEBUG === 'true',
    },

    timeouts: {
        api: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || '30000', 10),
        wsReconnect: parseInt(process.env.NEXT_PUBLIC_WS_RECONNECT_MS || '5000', 10),
    },
};

/**
 * Helper to build full API endpoint URL
 */
export function apiEndpoint(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${config.apiUrl}${normalizedPath}`;
}

/**
 * Helper to build full WebSocket endpoint URL
 */
export function wsEndpoint(namespace: string): string {
    const normalizedNs = namespace.startsWith('/') ? namespace : `/${namespace}`;
    return `${config.wsUrl}${normalizedNs}`;
}

/**
 * Helper to build asset URL (avatars, attachments, etc.)
 */
export function assetUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${config.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export default config;
