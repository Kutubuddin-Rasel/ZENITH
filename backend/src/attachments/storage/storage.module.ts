// src/attachments/storage/storage.module.ts
import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { FILE_STORAGE_PROVIDER } from './interfaces/file-storage-provider.interface';
import { LocalDiskProvider } from './providers/local-disk.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';

/**
 * Storage Module
 * 
 * Provides a swappable file storage backend based on configuration.
 * 
 * Environment Variable:
 *   STORAGE_PROVIDER=local      (default - filesystem)
 *   STORAGE_PROVIDER=s3         (AWS S3)
 *   STORAGE_PROVIDER=cloudinary (Cloudinary CDN)
 */
@Module({})
export class StorageModule {
    static forRoot(): DynamicModule {
        const storageProvider: Provider = {
            provide: FILE_STORAGE_PROVIDER,
            useFactory: (configService: ConfigService) => {
                const providerType = configService.get<string>('STORAGE_PROVIDER', 'local');

                switch (providerType) {
                    case 's3':
                        return new S3StorageProvider(configService);
                    case 'cloudinary':
                        return new CloudinaryStorageProvider(configService);
                    case 'local':
                    default:
                        return new LocalDiskProvider();
                }
            },
            inject: [ConfigService],
        };

        return {
            module: StorageModule,
            imports: [ConfigModule],
            providers: [
                storageProvider,
                LocalDiskProvider,
                S3StorageProvider,
                CloudinaryStorageProvider,
            ],
            exports: [FILE_STORAGE_PROVIDER],
            global: true,
        };
    }
}

