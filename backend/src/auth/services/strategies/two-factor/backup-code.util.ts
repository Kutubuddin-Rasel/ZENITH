import { randomInt } from 'crypto';
import * as argon2 from 'argon2';

const CODE_LENGTH = 8;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Cryptographically-secure 8-char alphanumeric backup code. */
export function generateRandomCode(): string {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return result;
}

/**
 * Generate `count` backup codes alongside their Argon2id hashes.
 * Returns both forms — plaintext is shown to the user exactly once,
 * hashes are persisted.
 */
export async function generateBackupCodes(count: number): Promise<{
  plaintextCodes: string[];
  hashedCodes: string[];
}> {
  const plaintextCodes: string[] = [];
  const hashPromises: Promise<string>[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateRandomCode();
    plaintextCodes.push(code);
    hashPromises.push(
      argon2.hash(code, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 4,
      }),
    );
  }

  const hashedCodes = await Promise.all(hashPromises);
  return { plaintextCodes, hashedCodes };
}
