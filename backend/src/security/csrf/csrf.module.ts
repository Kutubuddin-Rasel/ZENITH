import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../../audit/audit.module';
import { CacheModule } from '../../cache/cache.module';
import { EncryptionModule } from '../../encryption';
import {
  CSRF_AUDITOR_TOKEN,
  CSRF_CONFIG_TOKEN,
  CSRF_RATE_LIMITER_TOKEN,
  CSRF_REQUEST_CONTEXT_TOKEN,
  CSRF_TOKEN_COMMAND_TOKEN,
  CSRF_TOKEN_QUERY_TOKEN,
  CSRF_TOKEN_REPOSITORY_TOKEN,
} from './constants/csrf.tokens';
import { CsrfConfigService } from './config/csrf-config.service';
import { CsrfController } from './csrf.controller';
import { StatefulCsrfGuard } from './guards/csrf.guard';
import {
  ICsrfAuditor,
  ICsrfConfig,
  ICsrfRateLimiter,
  ICsrfRequestContext,
  ICsrfTokenCommand,
  ICsrfTokenQuery,
  ICsrfTokenRepository,
} from './interfaces/csrf.interfaces';
import { RedisCsrfTokenRepository } from './repositories/redis/redis-csrf-token.repository';
import { CsrfAuditService } from './services/csrf-audit.service';
import { CsrfRateLimiterService } from './services/csrf-rate-limiter.service';
import { CsrfTokenCommandService } from './services/csrf-token-command.service';
import { CsrfTokenQueryService } from './services/csrf-token-query.service';
import { ExpressCsrfRequestContext } from './services/express-csrf-request-context.service';

/**
 * CSRF Module — DIP/ISP wiring (Step 2 of SOLID refactor).
 *
 * DOUBLE-BINDING: each concrete is registered once, then aliased to
 * BOTH its symbol token AND its abstract port class via `useExisting`.
 * Consumers may inject either form and resolve the same singleton.
 *
 * `APP_GUARD: useExisting StatefulCsrfGuard` (not `useClass`): the
 * access-control refactor proved that `useClass` produces a SECOND
 * guard instance bound to APP_GUARD, distinct from the one provided
 * directly. `useExisting` collapses to the single singleton — required
 * for any service whose state must be shared between direct injection
 * and global activation.
 */
@Global()
@Module({
  imports: [CacheModule, AuditModule, ConfigModule, EncryptionModule],
  controllers: [CsrfController],
  providers: [
    // Concrete implementations
    CsrfConfigService,
    RedisCsrfTokenRepository,
    CsrfTokenCommandService,
    CsrfTokenQueryService,
    CsrfRateLimiterService,
    CsrfAuditService,
    ExpressCsrfRequestContext,
    StatefulCsrfGuard,

    // Double-binding: token + abstract class → same singleton
    { provide: CSRF_CONFIG_TOKEN, useExisting: CsrfConfigService },
    { provide: ICsrfConfig, useExisting: CsrfConfigService },

    {
      provide: CSRF_TOKEN_REPOSITORY_TOKEN,
      useExisting: RedisCsrfTokenRepository,
    },
    { provide: ICsrfTokenRepository, useExisting: RedisCsrfTokenRepository },

    {
      provide: CSRF_TOKEN_COMMAND_TOKEN,
      useExisting: CsrfTokenCommandService,
    },
    { provide: ICsrfTokenCommand, useExisting: CsrfTokenCommandService },

    { provide: CSRF_TOKEN_QUERY_TOKEN, useExisting: CsrfTokenQueryService },
    { provide: ICsrfTokenQuery, useExisting: CsrfTokenQueryService },

    { provide: CSRF_RATE_LIMITER_TOKEN, useExisting: CsrfRateLimiterService },
    { provide: ICsrfRateLimiter, useExisting: CsrfRateLimiterService },

    { provide: CSRF_AUDITOR_TOKEN, useExisting: CsrfAuditService },
    { provide: ICsrfAuditor, useExisting: CsrfAuditService },

    {
      provide: CSRF_REQUEST_CONTEXT_TOKEN,
      useExisting: ExpressCsrfRequestContext,
    },
    { provide: ICsrfRequestContext, useExisting: ExpressCsrfRequestContext },

    // Global activation (only fires on @RequireCsrf() decorated handlers).
    { provide: APP_GUARD, useExisting: StatefulCsrfGuard },
  ],
  exports: [
    // Internal re-exports for sibling-module providers. Public surface
    // is the index.ts barrel (Step 3). Only tokens + abstractions are
    // exported — never concrete classes.
    StatefulCsrfGuard,
    CSRF_TOKEN_COMMAND_TOKEN,
    ICsrfTokenCommand,
    CSRF_TOKEN_QUERY_TOKEN,
    ICsrfTokenQuery,
  ],
})
export class CsrfModule {}
