import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private apiKeysService: ApiKeysService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();

    // Extract API key from headers
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const authHeader = request.headers['authorization'];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const apiKeyHeader = request.headers['x-api-key'];

    let apiKey: string | null = null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      apiKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      return false; // No API key provided, let JWT guard handle it
    }

    // Validate the API key
    const keyRecord = await this.apiKeysService.validateKey(apiKey);
    if (!keyRecord) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Check required scopes (if any)
    const requiredScopes = this.reflector.get<string[]>(
      'scopes',
      context.getHandler(),
    );
    if (requiredScopes && requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) =>
        keyRecord.scopes.includes(scope),
      );
      if (!hasAllScopes) {
        throw new UnauthorizedException(
          `Missing required scopes: ${requiredScopes.join(', ')}`,
        );
      }
    }

    // Attach user and API key to request
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    request.user = keyRecord.user;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    request.apiKey = keyRecord;

    return true;
  }
}
