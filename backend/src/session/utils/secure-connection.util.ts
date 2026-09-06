import { Logger } from '@nestjs/common';

const logger = new Logger('SecureConnection');

/**
 * Determine whether the request arrived over a secure (HTTPS) connection.
 *
 * SECURITY: Supports Zero Trust / Load Balancer environments where SSL is
 * terminated at the edge (AWS ALB, Nginx, Cloudflare, etc.).
 *
 * CHECK ORDER (priority):
 *   1. X-Forwarded-Proto header (set by load balancers)
 *   2. req.secure (Express property, respects trust proxy)
 *   3. req.protocol (direct protocol check)
 *   4. Development fallback (localhost)
 *
 * WARNING: X-Forwarded-Proto can be spoofed by attackers. In production ensure
 * your edge firewall/LB overwrites this header, and configure
 * `app.set('trust proxy', true)` in main.ts for a reliable `req.secure`.
 *
 * This is a transport concern; it was extracted out of SessionService so the
 * controller resolves `isSecure` and passes it down as plain data.
 */
export function isSecureConnection(req?: {
  headers?: Record<string, string | string[] | undefined>;
  secure?: boolean;
  protocol?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
}): boolean {
  if (!req) {
    logger.debug('isSecureConnection: No request object provided');
    return false;
  }

  // PRIORITY 1: X-Forwarded-Proto header (Load Balancer indicator)
  const forwardedProto = req.headers?.['x-forwarded-proto'];
  if (forwardedProto) {
    const proto = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto.split(',')[0].trim();
    if (proto.toLowerCase() === 'https') {
      logger.debug('isSecureConnection: HTTPS via X-Forwarded-Proto');
      return true;
    }
  }

  // PRIORITY 2: Express req.secure (respects trust proxy setting)
  if (req.secure === true) {
    logger.debug('isSecureConnection: HTTPS via req.secure');
    return true;
  }

  // PRIORITY 3: Direct protocol check
  if (req.protocol === 'https') {
    logger.debug('isSecureConnection: HTTPS via req.protocol');
    return true;
  }

  // DEVELOPMENT FALLBACK: localhost is considered "secure" for local dev
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (isDevelopment) {
    const clientIp = req.ip || req.socket?.remoteAddress || '';
    const isLocalhost =
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1';

    if (isLocalhost) {
      logger.debug(
        'isSecureConnection: Development mode - localhost treated as secure',
      );
      return true;
    }
  }

  logger.debug('isSecureConnection: Connection is NOT secure');
  return false;
}
