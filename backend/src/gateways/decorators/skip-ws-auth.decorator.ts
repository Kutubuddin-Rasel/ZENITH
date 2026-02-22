import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for the SkipWsAuth decorator.
 * Used by WsJwtGuard to skip per-message JWT validation
 * for specific handlers (e.g., `auth:refresh`).
 */
export const SKIP_WS_AUTH_KEY = 'skipWsAuth';

/**
 * Decorator to bypass per-message WsJwtGuard validation.
 *
 * SECURITY: Use ONLY on handlers that perform their own
 * authentication (e.g., `auth:refresh` which verifies the
 * new JWT in its handler body). Never use on business handlers.
 *
 * @example
 * ```typescript
 * @SkipWsAuth()
 * @SubscribeMessage('auth:refresh')
 * async handleTokenRefresh(...) { ... }
 * ```
 */
export const SkipWsAuth = () => SetMetadata(SKIP_WS_AUTH_KEY, true);
