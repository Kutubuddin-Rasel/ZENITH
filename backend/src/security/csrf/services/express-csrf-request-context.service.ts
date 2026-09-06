import { Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { CSRF_CONFIG_TOKEN } from '../constants/csrf.tokens';
import {
  CsrfRequestSnapshot,
  ICsrfConfig,
  ICsrfRequestContext,
} from '../interfaces/csrf.interfaces';

interface RequestWithUser extends Request {
  user?: {
    userId?: string;
    id?: string;
    sub?: string;
  };
}

/**
 * Pure HTTP-extraction surface. Produces a `CsrfRequestSnapshot` from an
 * `express.Request` so the guard can orchestrate over a plain data
 * record — its integration test no longer needs an Express harness.
 *
 * RESOLUTION ORDER (mirrors legacy guard exactly):
 *  - clientIp: `x-forwarded-for` (first entry of array OR comma list),
 *    else `socket.remoteAddress`, else `request.ip`, else `'unknown'`.
 *  - userId: `req.user.userId` → `req.user.id` → `req.user.sub` → null.
 *  - csrfHeader: case-insensitive read of `ICsrfConfig.headerName`.
 *  - isBearerAuth: `Authorization` header starts with `Bearer ` — the
 *    flag the guard's bearer-bypass branch keys on.
 */
@Injectable()
export class ExpressCsrfRequestContext extends ICsrfRequestContext {
  constructor(@Inject(CSRF_CONFIG_TOKEN) private readonly config: ICsrfConfig) {
    super();
  }

  extract(request: Request): CsrfRequestSnapshot {
    const typed = request as RequestWithUser;
    return {
      clientIp: this.resolveClientIp(request),
      userId: typed.user?.userId || typed.user?.id || typed.user?.sub || null,
      csrfHeader: this.readHeader(request, this.config.headerName),
      isBearerAuth: this.hasBearerAuth(request),
      path: request.path || request.url,
      method: request.method,
      userAgent: request.headers['user-agent'] || 'unknown',
    };
  }

  private resolveClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return first.trim();
    }
    return request.socket?.remoteAddress || request.ip || 'unknown';
  }

  private readHeader(request: Request, headerName: string): string | null {
    const raw = request.headers[headerName.toLowerCase()];
    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }
    return raw ?? null;
  }

  private hasBearerAuth(request: Request): boolean {
    const auth = request.headers['authorization'];
    return typeof auth === 'string' && auth.startsWith('Bearer ');
  }
}
