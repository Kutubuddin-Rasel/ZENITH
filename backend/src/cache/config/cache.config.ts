import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

/**
 * Build TLS configuration for Redis connection.
 *
 * SECURITY (Cache Module Phase 2):
 * - Production: TLS enabled by default (rejectUnauthorized: true)
 * - Can be explicitly enabled/disabled via REDIS_TLS_ENABLED
 * - CA certificate loaded from REDIS_CA_CERT (Base64) or REDIS_CA_CERT_PATH (file)
 *
 * @param configService - NestJS ConfigService
 * @param isProduction - Whether running in production mode
 * @returns TLS options object or undefined
 */
function buildRedisTlsConfig(
  configService: ConfigService,
  isProduction: boolean,
): { rejectUnauthorized: boolean; ca?: Buffer | string } | undefined {
  // Check if TLS is explicitly enabled/disabled, default to production mode
  const tlsEnabledEnv = configService.get<string>('REDIS_TLS_ENABLED');
  const tlsEnabled =
    tlsEnabledEnv !== undefined ? tlsEnabledEnv === 'true' : isProduction; // Default: enabled in production

  if (!tlsEnabled) {
    // TLS disabled (typically local development with Docker Redis)
    return undefined;
  }

  // TLS is enabled - load CA certificate if provided
  const caBase64 = configService.get<string>('REDIS_CA_CERT');
  const caFilePath = configService.get<string>('REDIS_CA_CERT_PATH');

  let ca: Buffer | string | undefined;

  // Option 1: Base64-encoded CA (preferred for 12-factor apps / K8s secrets)
  if (caBase64) {
    try {
      ca = Buffer.from(caBase64, 'base64');
    } catch (error) {
      throw new Error(
        `[Redis] Failed to decode REDIS_CA_CERT from Base64: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
  // Option 2: File path to CA certificate
  else if (caFilePath) {
    try {
      ca = fs.readFileSync(caFilePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `[Redis] Failed to read CA certificate from REDIS_CA_CERT_PATH (${caFilePath}): ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Note: AWS ElastiCache and Redis Cloud use trusted roots, CA often not needed
  if (!ca && isProduction) {
    console.warn(
      '[Redis] TLS enabled without custom CA certificate. ' +
        'Connection will use system CA store (works for AWS ElastiCache, Redis Cloud).',
    );
  }

  return {
    rejectUnauthorized: true, // CRITICAL: Always verify certificates
    ...(ca && { ca }),
  };
}

/**
 * Create Redis configuration with security validation.
 *
 * SECURITY (Cache Module Phases 1-2):
 * - Phase 1: REDIS_PASSWORD is REQUIRED in production (fail-fast)
 * - Phase 2: TLS enabled by default in production (rejectUnauthorized: true)
 *
 * This prevents running Redis without authentication or encryption in production,
 * which would expose cached data and allow arbitrary command execution.
 */
export const createRedisConfig = (configService: ConfigService) => {
  const isProduction = configService.get('NODE_ENV') === 'production';
  const password = configService.get<string>('REDIS_PASSWORD');

  // ==========================================================================
  // REDIS PASSWORD VALIDATION (Phase 1 - Cache Module Remediation)
  // ==========================================================================
  const hasValidPassword = password && password.trim().length > 0;

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

  // ==========================================================================
  // REDIS TLS CONFIGURATION (Phase 2 - Cache Module Remediation)
  // ==========================================================================
  const tlsConfig = buildRedisTlsConfig(configService, isProduction);

  return {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password: hasValidPassword ? password : undefined,
    db: parseInt(configService.get('REDIS_DB', '0'), 10) || 0,
    tls: tlsConfig, // Phase 2: TLS enabled in production
    keyPrefix: 'zenith:',
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryDelayOnClusterDown: 300,
    enableOfflineQueue: false,
    maxLoadingTimeout: 5000,
    // Connection pool settings
    family: 4, // IPv4
    // Performance settings
    enableAutoPipelining: true,
    maxMemoryPolicy: 'allkeys-lru',
    // Monitoring - only log errors to stderr, connection events handled internally
    onError: (err: Error) => {
      // Use stderr for errors (these go to Pino structured logs in production)
      if (process.env.NODE_ENV === 'production') {
        process.stderr.write(`Redis connection error: ${err.message}\n`);
      } else {
        console.error('Redis connection error:', err);
      }
    },
    onConnect: () => {
      // Silent in production - Pino handles startup logs
    },
    onReady: () => {
      // Silent in production - use health checks instead of connection logs
    },
    onReconnecting: () => {
      // Silent in production - use health checks instead of connection logs
    },
    onEnd: () => {
      // Silent in production
    },
  };
};
