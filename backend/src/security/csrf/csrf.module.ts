import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { CsrfController } from './csrf.controller';
import { StatefulCsrfGuard } from './csrf.guard';
import { CacheModule } from '../../cache/cache.module';
import { AuditModule } from '../../audit/audit.module';

@Global()
@Module({
  imports: [CacheModule, AuditModule],
  providers: [
    CsrfService,
    StatefulCsrfGuard,
    // Register CSRF Guard globally (only activates with @RequireCsrf decorator)
    {
      provide: APP_GUARD,
      useClass: StatefulCsrfGuard,
    },
  ],
  controllers: [CsrfController],
  exports: [CsrfService, StatefulCsrfGuard],
})
export class CsrfModule {}
