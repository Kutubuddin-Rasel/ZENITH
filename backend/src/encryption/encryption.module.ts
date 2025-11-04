import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { FileEncryptionService } from './services/file-encryption.service';
import { DatabaseEncryptionInterceptor } from './interceptors/database-encryption.interceptor';

@Module({
  imports: [ConfigModule],
  providers: [
    EncryptionService,
    FileEncryptionService,
    DatabaseEncryptionInterceptor,
  ],
  exports: [
    EncryptionService,
    FileEncryptionService,
    DatabaseEncryptionInterceptor,
  ],
})
export class EncryptionModule {}
