import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password Service - Argon2id Only
 *
 * Uses Argon2id (winner of Password Hashing Competition) for all password operations.
 * Simplified for development phase - no legacy bcrypt support needed.
 */
@Injectable()
export class PasswordService {
  /**
   * Hash a password using Argon2id
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3, // 3 iterations
      parallelism: 4, // 4 threads
    });
  }

  /**
   * Verify a password against stored Argon2id hash
   */
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
