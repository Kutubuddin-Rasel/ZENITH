import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  generateSecureToken,
  TokenPrefix,
} from '../../common/utils/token.util';
import { IApiKeyCryptoService } from '../interfaces/api-keys.interfaces';

/**
 * Sole consumer of `bcrypt` and the CSPRNG token generator inside the
 * api-keys module. Every other service injects this through
 * `API_KEY_CRYPTO_TOKEN` so deterministic tests can substitute a
 * fixed-output implementation without monkey-patching `bcrypt` or
 * `crypto.randomBytes`.
 */
@Injectable()
export class ApiKeyCryptoService implements IApiKeyCryptoService {
  private static readonly BCRYPT_COST = 10;
  private static readonly KEY_PREFIX_LENGTH = 12;
  private static readonly KEY_BODY_LENGTH = 24;

  generateRawKey(): { plainKey: string; keyPrefix: string } {
    const plainKey = generateSecureToken(
      TokenPrefix.API_KEY,
      ApiKeyCryptoService.KEY_BODY_LENGTH,
    );
    const keyPrefix = plainKey.substring(
      0,
      ApiKeyCryptoService.KEY_PREFIX_LENGTH,
    );
    return { plainKey, keyPrefix };
  }

  hash(plainKey: string): Promise<string> {
    return bcrypt.hash(plainKey, ApiKeyCryptoService.BCRYPT_COST);
  }

  compare(plainKey: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainKey, hash);
  }
}
