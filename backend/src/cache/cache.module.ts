import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheTtlService } from './cache-ttl.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService, CacheTtlService],
  exports: [CacheService, CacheTtlService],
})
export class CacheModule {}
