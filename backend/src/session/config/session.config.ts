import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISessionConfig } from '../interfaces/session.interfaces';

/**
 * Strongly-typed {@link ISessionConfig} — isolates the `ConfigService` reads
 * that previously lived in the SessionService constructor. Defaults preserved
 * verbatim (5 / 30 / 30).
 */
@Injectable()
export class SessionConfig implements ISessionConfig {
  readonly maxConcurrentSessions: number;
  readonly sessionTimeoutMinutes: number;
  readonly rememberMeDays: number;

  constructor(config: ConfigService) {
    this.maxConcurrentSessions =
      config.get<number>('MAX_CONCURRENT_SESSIONS') || 5;
    this.sessionTimeoutMinutes =
      config.get<number>('SESSION_TIMEOUT_MINUTES') || 30;
    this.rememberMeDays = config.get<number>('REMEMBER_ME_DAYS') || 30;
  }
}
