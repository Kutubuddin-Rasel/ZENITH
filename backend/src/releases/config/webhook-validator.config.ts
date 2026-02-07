// src/releases/config/webhook-validator.config.ts
import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('WebhookValidator');

/**
 * SECURITY: SSRF Prevention - Webhook URL Allowlist
 *
 * Only these hostnames are allowed as deployment webhook targets.
 * This prevents attackers from using the deploy endpoint to make
 * requests to internal services or arbitrary external URLs.
 */
export const ALLOWED_WEBHOOK_HOSTS = new Set([
    // CI/CD Providers
    'api.github.com',
    'gitlab.com',
    'circleci.com',

    // Self-hosted (configurable via env)
    ...(process.env.ALLOWED_WEBHOOK_HOSTS?.split(',').map((h) => h.trim()) ||
        []),
]);

/**
 * Network hardening settings for outgoing webhook requests
 */
export const WEBHOOK_REQUEST_CONFIG = {
    /** Maximum time to wait for response (ms) */
    TIMEOUT: 5000,

    /** Redirects are forbidden to prevent SSRF bypass */
    MAX_REDIRECTS: 0,

    /** Only HTTPS is allowed */
    REQUIRED_PROTOCOL: 'https:',

    /** Request headers for identification */
    HEADERS: {
        'User-Agent': 'Zenith-Deploy/1.0',
        'Content-Type': 'application/json',
    },
} as const;

/**
 * Validate a webhook URL against the SSRF allowlist
 *
 * @param urlString - The webhook URL to validate
 * @throws BadRequestException if URL fails validation
 * @returns Parsed URL object if valid
 */
export function validateWebhookUrl(urlString: string): URL {
    if (!urlString || typeof urlString !== 'string') {
        throw new BadRequestException('Webhook URL is required');
    }

    // Parse URL safely
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(urlString);
    } catch {
        logger.warn(`SSRF: Invalid URL format: ${urlString}`);
        throw new BadRequestException('Invalid webhook URL format');
    }

    // Check protocol (HTTPS only)
    if (parsedUrl.protocol !== WEBHOOK_REQUEST_CONFIG.REQUIRED_PROTOCOL) {
        logger.warn(`SSRF: Non-HTTPS URL rejected: ${parsedUrl.protocol}`);
        throw new BadRequestException(
            'Webhook URL must use HTTPS protocol for security',
        );
    }

    // Check hostname against allowlist (exact match only)
    const hostname = parsedUrl.hostname.toLowerCase();
    if (!ALLOWED_WEBHOOK_HOSTS.has(hostname)) {
        logger.warn(`SSRF: Hostname not in allowlist: ${hostname}`);
        throw new BadRequestException(
            `Webhook host '${hostname}' is not in the allowed list. ` +
            `Allowed: ${Array.from(ALLOWED_WEBHOOK_HOSTS).join(', ')}`,
        );
    }

    // Prevent IP address bypass
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6Regex = /^\[.*\]$/;
    if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
        logger.warn(`SSRF: Direct IP address rejected: ${hostname}`);
        throw new BadRequestException(
            'Direct IP addresses are not allowed for webhooks',
        );
    }

    // Prevent localhost variants
    const localhostVariants = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '[::1]',
    ];
    if (localhostVariants.includes(hostname)) {
        logger.warn(`SSRF: Localhost variant rejected: ${hostname}`);
        throw new BadRequestException(
            'Localhost addresses are not allowed for webhooks',
        );
    }

    return parsedUrl;
}

/**
 * Build axios/fetch config with security hardening
 */
export function buildSecureRequestConfig() {
    return {
        timeout: WEBHOOK_REQUEST_CONFIG.TIMEOUT,
        maxRedirects: WEBHOOK_REQUEST_CONFIG.MAX_REDIRECTS,
        headers: WEBHOOK_REQUEST_CONFIG.HEADERS,
        validateStatus: (status: number) => status >= 200 && status < 300,
    };
}
