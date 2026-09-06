import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ApiKeySummary,
  IApiKeyPolicy,
} from '../interfaces/api-keys.interfaces';

/**
 * Pure policy checks for the api-keys aggregate. Every method throws
 * on violation — never returns a boolean — so callers do not have to
 * branch on the result. No DB, no audit, no event bus; safe to unit
 * test without any test doubles.
 */
@Injectable()
export class ApiKeyPolicyService implements IApiKeyPolicy {
  assertOwnedBy(key: ApiKeySummary, actorId: string): void {
    if (key.userId !== actorId) {
      throw new ForbiddenException(
        'API key is not owned by the requesting actor',
      );
    }
  }

  assertNotRotated(key: ApiKeySummary): void {
    if (key.rotatedToKeyId) {
      throw new BadRequestException(
        'This key has already been rotated. Use the new key instead.',
      );
    }
  }

  assertNotExpired(key: ApiKeySummary): void {
    if (key.expiresAt && new Date() > key.expiresAt) {
      throw new BadRequestException('API key has expired');
    }
  }

  assertWithinGracePeriod(key: ApiKeySummary): void {
    if (key.revokeAt && new Date() > key.revokeAt) {
      throw new BadRequestException(
        'API key rotation grace period has elapsed',
      );
    }
  }
}
