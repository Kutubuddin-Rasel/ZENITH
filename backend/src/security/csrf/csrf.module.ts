import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { CsrfController } from './csrf.controller';
import { CsrfGuard } from './csrf.guard';
import { CacheModule } from '../../cache/cache.module';

@Global()
@Module({
  imports: [CacheModule],
  providers: [
    CsrfService,
    CsrfGuard,
    // Register CSRF Guard globally (only activates with @RequireCsrf decorator)
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
  controllers: [CsrfController],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}
