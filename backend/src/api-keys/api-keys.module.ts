import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyCleanupService } from './services/api-key-cleanup.service';
import { ApiKey } from './entities/api-key.entity';
import { AuditModule } from '../audit/audit.module';
import { CacheModule } from '../cache/cache.module';
import { AccessControlModule } from '../access-control/access-control.module';

// Step 2 — Repository inversion (DIP).
import { AbstractApiKeyRepository } from './repositories/abstract/api-key.repository.abstract';
import { PostgresApiKeyRepository } from './repositories/postgres/postgres-api-key.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    ScheduleModule.forRoot(), // For background cleanup jobs
    AuditModule, // For PCI-DSS compliant audit logging
    CacheModule, // For Redis rate limiting
    AccessControlModule, // For IpResolutionService (IP allowlist checking)
  ],
  controllers: [ApiKeysController],
  providers: [
    // DIP — abstract repository bound to the Postgres implementation.
    // Sole owner of `@InjectRepository(ApiKey)` from this commit forward.
    { provide: AbstractApiKeyRepository, useClass: PostgresApiKeyRepository },
    ApiKeysService,
    ApiKeyGuard,
    ApiKeyCleanupService,
  ],
  exports: [ApiKeysService, ApiKeyGuard], // Export for use in other modules
})
export class ApiKeysModule {}
