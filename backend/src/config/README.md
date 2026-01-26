# Configuration Module

This directory contains typed configuration modules for enterprise-grade deployment flexibility.

## Architecture

```
Environment Variables (.env)
         ↓
    src/config/*.ts (Typed Configuration Modules)
         ↓
    ConfigService (NestJS @nestjs/config)
         ↓
    Service Injection (Type-Safe Access)
```

## Configuration Files

| File | Purpose | Key Variables |
|------|---------|---------------|
| `app.config.ts` | URLs, environment, CORS | `API_BASE_URL`, `FRONTEND_URL`, `CORS_*` |
| `auth.config.ts` | JWT, cookies, password, 2FA | `JWT_*`, `COOKIE_*`, `PASSWORD_*`, `TOTP_*` |
| `rate-limit.config.ts` | Rate limiting | `RATE_LIMIT_*` |
| `cache.config.ts` | Redis, TTL tiers | `REDIS_*`, `CACHE_TTL_*` |
| `integration.config.ts` | External APIs, circuit breaker | `*_TIMEOUT_MS`, `CIRCUIT_BREAKER_*` |

## Usage

### In Services

```typescript
import { ConfigService } from '@nestjs/config';
import { AuthConfig } from '../config/auth.config';

@Injectable()
export class MyService {
  constructor(private configService: ConfigService) {
    const authConfig = this.configService.get<AuthConfig>('auth');
    const accessExpiry = authConfig?.jwt.accessTokenExpiry || '15m';
  }
}
```

### Cache TTL Tiers

```typescript
import { CacheTtlService } from '../cache/cache-ttl.service';

@Injectable()
export class MyService {
  constructor(
    private cacheService: CacheService,
    private cacheTtl: CacheTtlService,
  ) {}

  async getData() {
    await this.cacheService.set(key, value, { ttl: this.cacheTtl.medium });
  }
}
```

## Quick Reference

### Required for Production

- `JWT_SECRET` - Access token signing (generate: `openssl rand -base64 32`)
- `JWT_REFRESH_SECRET` - Refresh token signing
- `FIELD_ENCRYPTION_KEY` - Field encryption
- `DATABASE_URL` - PostgreSQL connection

### Default Values

All configuration has sensible defaults for development. See `.env.example` for full documentation.
