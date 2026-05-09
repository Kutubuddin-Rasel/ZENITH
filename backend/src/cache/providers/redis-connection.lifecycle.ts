import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { CACHE_CLIENT_TOKEN } from '../constants/cache.tokens';

/**
 * RedisConnectionLifecycle — owns connection lifecycle for the shared
 * ioredis client provided under `CACHE_CLIENT_TOKEN`.
 *
 * RESPONSIBILITY (single):
 *  - Wire up event listeners for observability.
 *  - Force lazy connection by issuing a bounded ping on `onModuleInit`.
 *  - Gracefully `quit()` the client on `onModuleDestroy`.
 *
 * The client itself is constructed in `CacheModule`'s `useFactory` so it can
 * be injected by every provider with the same singleton instance. Providers
 * gate operations on `client.status === 'ready'`; this service does NOT
 * expose a separate connectivity flag.
 */
@Injectable()
export class RedisConnectionLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionLifecycle.name);

  constructor(
    @Inject(CACHE_CLIENT_TOKEN) private readonly client: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client.on('error', (err: Error) => {
      this.logger.warn(
        `Redis connection error (cache will be disabled): ${err.message}`,
      );
    });
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('ready', () => this.logger.log('Redis ready for operations'));
    this.client.on('reconnecting', () => this.logger.log('Redis reconnecting...'));
    this.client.on('end', () => this.logger.log('Redis connection ended'));

    // Bounded ping to force lazy connection AND validate the handshake.
    const pingPromise = this.client.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timeout')), 3000),
    );

    try {
      await Promise.race([pingPromise, timeoutPromise]);
      this.logger.log('Cache lifecycle initialized');
    } catch (error: unknown) {
      this.logger.warn(
        `Redis not available, cache will be disabled: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    try {
      await this.client.quit();
      this.logger.log('Cache lifecycle disconnected');
    } catch (error: unknown) {
      this.logger.warn(
        `Error during Redis quit: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
