import { registerAs } from '@nestjs/config';
import * as fs from 'fs';

/**
 * Redis Connection Configuration (Cache Module Step 1).
 *
 * Registered under the `redis` namespace via `registerAs`, so consumers read it
 * with `configService.get<RedisConfig>('redis')` and the `CacheModule` can
 * load it via `ConfigModule.forFeature([redisConfig])` in Step 2.
 *
 * SECURITY (preserved from prior phases):
 *  - Phase 1: `REDIS_PASSWORD` is REQUIRED in production (fail-fast).
 *  - Phase 2: TLS enabled by default in production (`rejectUnauthorized: true`).
 *
 * NOTE: This module load is synchronous; `registerAs` callbacks execute at
 * `ConfigModule.forRoot/forFeature` time. The fail-fast throw therefore aborts
 * application bootstrap before any Redis client is ever constructed.
 */

type RedisTlsOptions =
  | { rejectUnauthorized: boolean; ca?: Buffer | string }
  | undefined;

function buildRedisTlsConfig(isProduction: boolean): RedisTlsOptions {
  const tlsEnabledEnv = process.env.REDIS_TLS_ENABLED;
  const tlsEnabled =
    tlsEnabledEnv !== undefined ? tlsEnabledEnv === 'true' : isProduction;

  if (!tlsEnabled) {
    return undefined;
  }

  const caBase64 = process.env.REDIS_CA_CERT;
  const caFilePath = process.env.REDIS_CA_CERT_PATH;

  let ca: Buffer | string | undefined;

  if (caBase64) {
    try {
      ca = Buffer.from(caBase64, 'base64');
    } catch (error) {
      throw new Error(
        `[Redis] Failed to decode REDIS_CA_CERT from Base64: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  } else if (caFilePath) {
    try {
      ca = fs.readFileSync(caFilePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `[Redis] Failed to read CA certificate from REDIS_CA_CERT_PATH (${caFilePath}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  if (!ca && isProduction) {
    // Trusted-root deployments (AWS ElastiCache, Redis Cloud) are valid.
    console.warn(
      '[Redis] TLS enabled without custom CA certificate. ' +
        'Connection will use system CA store (works for AWS ElastiCache, Redis Cloud).',
    );
  }

  return {
    rejectUnauthorized: true,
    ...(ca && { ca }),
  };
}

export const redisConfig = registerAs('redis', () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const password = process.env.REDIS_PASSWORD;
  const hasValidPassword = !!password && password.trim().length > 0;

  // Phase 1: fail-fast in production without a password.
  if (isProduction && !hasValidPassword) {
    throw new Error(
      '[Redis] Configuration Error: REDIS_PASSWORD is required in production. ' +
        'An unauthenticated Redis instance is a critical security vulnerability. ' +
        'Set the REDIS_PASSWORD environment variable before starting the application.',
    );
  }

  if (!isProduction && !hasValidPassword) {
    console.warn(
      '[Redis] WARNING: Running without authentication. ' +
        'This is only acceptable in development/test environments.',
    );
  }

  // Phase 2: TLS construction.
  const tls = buildRedisTlsConfig(isProduction);

  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: hasValidPassword ? password : undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10) || 0,
    tls,
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'zenith:',
    enableReadyCheck: false,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE_MS ?? '30000', 10),
    connectTimeout: parseInt(
      process.env.REDIS_CONNECT_TIMEOUT_MS ?? '10000',
      10,
    ),
    commandTimeout: parseInt(
      process.env.REDIS_COMMAND_TIMEOUT_MS ?? '5000',
      10,
    ),
    enableOfflineQueue: false,
    family: 4 as const,
    enableAutoPipelining: true,
  };
});

export type RedisConfig = ReturnType<typeof redisConfig>;
