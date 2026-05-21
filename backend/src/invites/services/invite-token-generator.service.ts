import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { IInviteTokenGenerator } from '../interfaces/invites.interfaces';

/**
 * InviteTokenGeneratorService
 *
 * Default implementation of `IInviteTokenGenerator`. Bound to
 * `INVITE_TOKEN_GENERATOR_TOKEN` inside `InvitesModule`.
 *
 * Wraps `crypto.randomBytes(32).toString('hex')` so deterministic
 * tests can bind a stub against the token instead of monkey-patching
 * the `crypto` module. 32 bytes = 256 bits of entropy, exceeding the
 * OWASP recommendation for opaque session-class tokens.
 */
@Injectable()
export class InviteTokenGeneratorService implements IInviteTokenGenerator {
  private static readonly TOKEN_BYTES = 32;

  generate(): string {
    return randomBytes(InviteTokenGeneratorService.TOKEN_BYTES).toString('hex');
  }
}
