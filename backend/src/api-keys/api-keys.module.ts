import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKey } from './entities/api-key.entity';
import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../cache/cache.module';
import { AccessControlModule } from '../access-control';

// DIP — Repository inversion (Step 2).
import { AbstractApiKeyRepository } from './repositories/abstract/api-key.repository.abstract';
import { PostgresApiKeyRepository } from './repositories/postgres/postgres-api-key.repository';

// ISP — Six segregated tokens (Step 3).
import {
  API_KEY_AUDIT_TOKEN,
  API_KEY_COMMAND_TOKEN,
  API_KEY_CRYPTO_TOKEN,
  API_KEY_POLICY_TOKEN,
  API_KEY_QUERY_TOKEN,
  API_KEY_VALIDATOR_TOKEN,
} from './constants/api-keys.tokens';
import { ApiKeyAuditService } from './services/api-key-audit.service';
import { ApiKeyCleanupService } from './services/api-key-cleanup.service';
import { ApiKeyCommandService } from './services/api-key-command.service';
import { ApiKeyCryptoService } from './services/api-key-crypto.service';
import { ApiKeyPolicyService } from './services/api-key-policy.service';
import { ApiKeyQueryService } from './services/api-key-query.service';
import { ApiKeyValidatorService } from './services/api-key-validator.service';

/**
 * ApiKeysModule
 *
 * Persistence: `@InjectRepository(ApiKey)` is permitted in EXACTLY one
 * file — `repositories/postgres/postgres-api-key.repository.ts`. Every
 * other consumer depends on `AbstractApiKeyRepository`.
 *
 * Public surface: only the ISP tokens + `ApiKeyGuard` (transport).
 * Concrete service classes are intentionally NOT exported — Step 4
 * will seal the module further via `index.ts` barrel.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    AuditModule,
    CacheModule,
    AccessControlModule,
  ],
  controllers: [ApiKeysController],
  providers: [
    // DIP — Abstract repository bound to Postgres adapter.
    { provide: AbstractApiKeyRepository, useClass: PostgresApiKeyRepository },
    // ISP — Six segregated tokens, one binding each.
    { provide: API_KEY_CRYPTO_TOKEN, useClass: ApiKeyCryptoService },
    { provide: API_KEY_POLICY_TOKEN, useClass: ApiKeyPolicyService },
    { provide: API_KEY_AUDIT_TOKEN, useClass: ApiKeyAuditService },
    { provide: API_KEY_QUERY_TOKEN, useClass: ApiKeyQueryService },
    { provide: API_KEY_COMMAND_TOKEN, useClass: ApiKeyCommandService },
    { provide: API_KEY_VALIDATOR_TOKEN, useClass: ApiKeyValidatorService },
    // Transport layer (class-imported by external consumers).
    ApiKeyGuard,
    // Module-internal cron worker — not exported.
    ApiKeyCleanupService,
  ],
  exports: [
    API_KEY_COMMAND_TOKEN,
    API_KEY_QUERY_TOKEN,
    API_KEY_VALIDATOR_TOKEN,
    API_KEY_AUDIT_TOKEN,
    ApiKeyGuard,
  ],
})
export class ApiKeysModule {}
