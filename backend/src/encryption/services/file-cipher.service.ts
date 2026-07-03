import { Inject, Injectable } from '@nestjs/common';
import {
  EncryptionContext,
  EncryptionResult,
  FileCipher,
  SymmetricCipher,
} from '../interfaces/encryption.interfaces';
import { SYMMETRIC_CIPHER_TOKEN } from '../tokens/encryption.tokens';

/**
 * Buffer-base64 file cipher — preserved for callers that round-trip a
 * `Buffer` through `EncryptionResult`. Distinct from
 * `FileEncryptionService`, which implements the envelope/DEK flow.
 */
@Injectable()
export class FileCipherService extends FileCipher {
  constructor(
    @Inject(SYMMETRIC_CIPHER_TOKEN)
    private readonly cipher: SymmetricCipher,
  ) {
    super();
  }

  encryptFile(
    fileBuffer: Buffer,
    key?: string,
    context?: EncryptionContext,
  ): EncryptionResult {
    return this.cipher.encrypt(fileBuffer.toString('base64'), key, context);
  }

  decryptFile(
    encryptedData: string,
    iv: string,
    tag: string,
    key?: string,
    context?: EncryptionContext,
    keyVersion?: number,
  ): Buffer {
    const result = this.cipher.decrypt(
      encryptedData,
      iv,
      tag,
      key,
      context,
      keyVersion,
    );
    if (!result.success) {
      throw new Error('File decryption failed');
    }
    return Buffer.from(result.decrypted, 'base64');
  }
}
