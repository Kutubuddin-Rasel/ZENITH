import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { EncryptionService } from '../encryption.service';

@Injectable()
export class DatabaseEncryptionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DatabaseEncryptionInterceptor.name);

  constructor(private encryptionService: EncryptionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    // Encrypt sensitive data before saving to database
    if (
      request.method === 'POST' ||
      request.method === 'PUT' ||
      request.method === 'PATCH'
    ) {
      this.encryptRequestBody(request);
    }

    return next.handle().pipe(
      map((data: unknown) => {
        // Decrypt sensitive data when reading from database
        if (request.method === 'GET') {
          return this.decryptResponseData(data);
        }
        return data;
      }),
      tap(() => {
        this.logger.debug('Database encryption/decryption completed');
      }),
    );
  }

  private encryptRequestBody(request: Request): void {
    try {
      const body = request.body as Record<string, unknown>;
      if (!body) return;

      // Define sensitive fields that need encryption
      const sensitiveFields = this.getSensitiveFields(request.url);

      if (sensitiveFields.length > 0) {
        request.body = this.encryptionService.encryptObject(
          body,
          sensitiveFields,
        );
        this.logger.debug(
          `Encrypted sensitive fields: ${sensitiveFields.join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to encrypt request body', error);
    }
  }

  private decryptResponseData(data: unknown): unknown {
    try {
      if (!data) return data;

      // Handle single object
      if (typeof data === 'object' && !Array.isArray(data)) {
        return this.decryptObject(data);
      }

      // Handle array of objects
      if (Array.isArray(data)) {
        return data.map((item) => this.decryptObject(item));
      }

      // Handle paginated response
      if (this.isPaginatedResponse(data)) {
        return {
          ...data,
          logs: data.logs.map((log: unknown) => this.decryptObject(log)),
        };
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to decrypt response data', error);
      return data;
    }
  }

  private decryptObject(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    const decrypted = { ...(obj as Record<string, unknown>) };

    // Decrypt common sensitive fields
    const sensitiveFields = [
      'details',
      'oldValues',
      'newValues',
      'metadata',
      'description',
      'notes',
      'comments',
      'content',
    ];

    for (const field of sensitiveFields) {
      if (field in decrypted && typeof decrypted[field] === 'string') {
        try {
          const encryptedData = JSON.parse(decrypted[field]) as {
            encrypted: string;
            iv: string;
            tag: string;
          };
          if (
            encryptedData.encrypted &&
            encryptedData.iv &&
            encryptedData.tag
          ) {
            const result = this.encryptionService.decrypt(
              encryptedData.encrypted,
              encryptedData.iv,
              encryptedData.tag,
            );
            if (result.success) {
              decrypted[field] = result.decrypted;
            }
          }
        } catch {
          // Field is not encrypted, keep as is
        }
      }
    }

    return decrypted;
  }

  private getSensitiveFields(url: string): string[] {
    // Define sensitive fields based on endpoint
    const fieldMappings: Record<string, string[]> = {
      '/audit/logs': ['details', 'oldValues', 'newValues', 'metadata'],
      '/issues': ['description', 'notes'],
      '/comments': ['content'],
      '/projects': ['description'],
      '/users': ['notes'],
      '/attachments': ['description'],
    };

    for (const [path, fields] of Object.entries(fieldMappings)) {
      if (url.includes(path)) {
        return fields;
      }
    }

    return [];
  }

  private isPaginatedResponse(data: unknown): data is { logs: unknown[] } {
    return (
      typeof data === 'object' &&
      data !== null &&
      'logs' in data &&
      Array.isArray((data as Record<string, unknown>).logs)
    );
  }
}
