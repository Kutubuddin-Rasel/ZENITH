import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ENCRYPTION_SERVICE_TOKEN } from '../constants/encryption.tokens';
import { EncryptionService } from '../services/encryption.service';
import { ConfigurableThrottlerGuard } from '../guards/configurable-throttler.guard';
import { MetricThrottlerGuard } from '../guards/metric-throttler.guard';

/**
 * CommonSecurityModule
 *
 * SRP: Owns cross-cutting security primitives — encryption (AES-256-GCM)
 * and the rate-limit / metric throttler guards. No domain dependencies.
 *
 * `EncryptionService` is bound to `ENCRYPTION_SERVICE_TOKEN` for DIP-clean
 * consumers; the concrete class is also exported for backward compatibility
 * with consumers that still inject it directly (Step 4 migrates those).
 */
@Module({
  imports: [ConfigModule],
  providers: [
    EncryptionService,
    { provide: ENCRYPTION_SERVICE_TOKEN, useExisting: EncryptionService },
    ConfigurableThrottlerGuard,
    MetricThrottlerGuard,
  ],
  exports: [
    EncryptionService,
    ENCRYPTION_SERVICE_TOKEN,
    ConfigurableThrottlerGuard,
    MetricThrottlerGuard,
  ],
})
export class CommonSecurityModule {}
