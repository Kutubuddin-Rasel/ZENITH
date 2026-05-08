import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { join } from 'path';

/**
 * Build SSL configuration for PostgreSQL connection.
 *
 * SECURITY (Phase 1 - Database Remediation):
 * - Production: rejectUnauthorized: true (prevents MITM attacks)
 * - CA certificate loaded from DATABASE_SSL_CA (Base64) or DATABASE_SSL_CA_PATH (file)
 * - Fails fast if production + SSL enabled but no CA provided
 *
 * @param configService - NestJS ConfigService
 * @param isProduction - Whether running in production mode
 * @returns SSL configuration object or false
 */
function buildSslConfig(
  configService: ConfigService,
  isProduction: boolean,
): false | { rejectUnauthorized: boolean; ca?: Buffer | string } {
  // Check if SSL is explicitly enabled/disabled
  const sslEnabled = configService.get<boolean>(
    'DATABASE_SSL_ENABLED',
    isProduction,
  );

  if (!sslEnabled) {
    // SSL disabled (typically local development with Docker Postgres)
    return false;
  }

  // SSL is enabled - determine verification mode
  if (!isProduction) {
    // Development with SSL (e.g., connecting to remote dev DB)
    // Allow unverified for convenience, but log warning
    console.warn(
      '[Database] SSL enabled in development mode with rejectUnauthorized: false. ' +
        'This is insecure but acceptable for non-production environments.',
    );
    return { rejectUnauthorized: false };
  }

  // =========================================================================
  // PRODUCTION: Strict TLS verification
  // =========================================================================
  // Attempt to load CA certificate from environment
  const caBase64 = configService.get<string>('DATABASE_SSL_CA');
  const caFilePath = configService.get<string>('DATABASE_SSL_CA_PATH');

  let ca: Buffer | string | undefined;

  // Option 1: Base64-encoded CA (preferred for 12-factor apps / K8s secrets)
  if (caBase64) {
    try {
      ca = Buffer.from(caBase64, 'base64');
    } catch (error) {
      throw new Error(
        `[Database] Failed to decode DATABASE_SSL_CA from Base64: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
  // Option 2: File path to CA certificate
  else if (caFilePath) {
    try {
      ca = fs.readFileSync(caFilePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `[Database] Failed to read CA certificate from DATABASE_SSL_CA_PATH (${caFilePath}): ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // FAIL FAST: Production + SSL but no CA = configuration error
  // Note: Some cloud providers (RDS public) use trusted roots, so we still connect but warn
  if (!ca) {
    console.warn(
      '[Database] SECURITY WARNING: SSL enabled in production without CA certificate. ' +
        'Connection will use system CA store. For maximum security, provide DATABASE_SSL_CA or DATABASE_SSL_CA_PATH.',
    );
  }

  return {
    rejectUnauthorized: true, // CRITICAL: Always verify in production
    ...(ca && { ca }), // Include CA if provided
  };
}

/**
 * Get a required configuration value.
 *
 * SECURITY (Phase 2 - Database Remediation):
 * - Production: Throws immediately if value is missing (fail-fast)
 * - Development: Falls back to default value for convenience
 *
 * This prevents silent fallback to insecure defaults in production
 * (e.g., 'password' or 'localhost').
 */
function getRequiredConfig<T>(
  configService: ConfigService,
  key: string,
  defaultValue: T,
  isProduction: boolean,
): T {
  const value = configService.get<T>(key);

  if (value !== undefined && value !== null && value !== '') {
    return value;
  }

  if (isProduction) {
    throw new Error(
      `[Database] Configuration Error: ${key} is required in production. ` +
        `Set the ${key} environment variable before starting the application.`,
    );
  }

  // Development: allow fallback with warning for password
  if (
    key.toLowerCase().includes('pass') ||
    key.toLowerCase().includes('password')
  ) {
    console.warn(
      `[Database] WARNING: Using default ${key}. This is only acceptable in development.`,
    );
  }

  return defaultValue;
}

export const createDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get('NODE_ENV') === 'production';

  // ==========================================================================
  // CREDENTIAL VALIDATION (Phase 2 - Fail-Fast in Production)
  // Production: Throws if missing. Development: Uses defaults.
  // ==========================================================================
  const dbHost = getRequiredConfig(
    configService,
    'DATABASE_HOST',
    'localhost',
    isProduction,
  );
  const dbPort = configService.get<number>('DATABASE_PORT', 5432); // Port can safely default
  const dbUser = getRequiredConfig(
    configService,
    'DATABASE_USER',
    'postgres',
    isProduction,
  );
  const dbPass = getRequiredConfig(
    configService,
    'DATABASE_PASS',
    'password',
    isProduction,
  );
  const dbName = getRequiredConfig(
    configService,
    'DATABASE_NAME',
    'zenith',
    isProduction,
  );

  // Base DB defaults for replication fallbacks
  const baseHost = dbHost;
  const basePort = dbPort;
  const baseUsername = dbUser;
  const basePassword = dbPass;
  const baseDatabase = dbName;

  // Configure pg-pool logging function
  const pgLogFunction = (msg: string) => {
    if (configService.get('DATABASE_QUERY_LOG', false)) {
      console.log(`[pg-pool] ${msg}`);
    }
  };

  // Build SSL configuration with proper validation
  const sslConfig = buildSslConfig(configService, isProduction);

  return {
    type: 'postgres',
    host: dbHost,
    port: dbPort,
    username: dbUser,
    password: dbPass,
    database: dbName,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: !isProduction, // CRITICAL: Always false in production to prevent data loss
    logging: configService.get<boolean>('DATABASE_LOGGING', false),
    ssl: sslConfig,

    // Direct fix for pg-pool
    poolErrorHandler: (err: Error) => {
      console.error('PostgreSQL pool error:', err);
    },

    // Connection Pool Configuration
    extra: {
      // Connection pool settings
      max: configService.get<number>('DATABASE_POOL_MAX', 20), // Maximum number of connections
      min: configService.get<number>('DATABASE_POOL_MIN', 5), // Minimum number of connections
      acquire: configService.get<number>('DATABASE_POOL_ACQUIRE', 30000), // Maximum time to acquire connection
      idle: configService.get<number>('DATABASE_POOL_IDLE', 10000), // Maximum idle time

      // Connection timeout settings
      connectionTimeoutMillis: configService.get<number>(
        'DATABASE_CONNECTION_TIMEOUT',
        2000,
      ),
      idleTimeoutMillis: configService.get<number>(
        'DATABASE_IDLE_TIMEOUT',
        30000,
      ),
      query_timeout: configService.get<number>('DATABASE_QUERY_TIMEOUT', 60000),

      // Performance settings
      statement_timeout: configService.get<number>(
        'DATABASE_STATEMENT_TIMEOUT',
        30000,
      ),
      application_name: 'zenith-api',

      // Connection validation
      validate: true,
      validateInterval: 30000, // Validate connections every 30 seconds

      // Retry settings
      retryDelayMillis: 1000,
      retryAttempts: 3,

      // Keep-alive settings
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,

      // Performance monitoring and logging
      // Fix for pg-pool's "this.log is not a function" error
      log: pgLogFunction,
    },

    // Migration settings
    migrationsRun: isProduction,
    migrationsTableName: 'migrations',

    // Cache settings - disabled for development
    // cache: {
    //   type: 'redis',
    //   options: {
    //     host: configService.get('REDIS_HOST', 'localhost'),
    //     port: configService.get('REDIS_PORT', 6379),
    //     password: configService.get('REDIS_PASSWORD'),
    //     db: configService.get('REDIS_DB', 0),
    //     keyPrefix: 'zenith:typeorm:',
    //     ttl: 300, // 5 minutes default TTL
    //   },
    //   duration: 30000, // 30 seconds
    //   ignoreErrors: true,
    // },

    // Query optimization
    maxQueryExecutionTime: configService.get<number>(
      'DATABASE_MAX_QUERY_TIME',
      5000,
    ), // 5 seconds
    dropSchema: false,
    autoLoadEntities: true,

    // Replication settings for read/write splitting
    replication: isProduction
      ? {
          master: {
            host: configService.get<string>('DATABASE_MASTER_HOST', baseHost),
            port: configService.get<number>('DATABASE_MASTER_PORT', basePort),
            username: configService.get<string>(
              'DATABASE_MASTER_USER',
              baseUsername,
            ),
            password: configService.get<string>(
              'DATABASE_MASTER_PASS',
              basePassword,
            ),
            database: configService.get<string>(
              'DATABASE_MASTER_NAME',
              baseDatabase,
            ),
          },
          slaves: [
            {
              host: configService.get<string>('DATABASE_SLAVE_HOST', baseHost),
              port: configService.get<number>('DATABASE_SLAVE_PORT', basePort),
              username: configService.get<string>(
                'DATABASE_SLAVE_USER',
                baseUsername,
              ),
              password: configService.get<string>(
                'DATABASE_SLAVE_PASS',
                basePassword,
              ),
              database: configService.get<string>(
                'DATABASE_SLAVE_NAME',
                baseDatabase,
              ),
            },
          ],
        }
      : undefined,
  };
};

// Redis configuration moved to `backend/src/cache/config/cache.config.ts`
// (SOLID/SRP: this module is responsible for PostgreSQL/TypeORM only).

// =============================================================================
// CLI DataSource (Step 5 — Bootstrap Consolidation)
//
// Single source of truth: the TypeORM CLI (migration:run/generate/revert) and
// the running application both derive their connection options from
// `createDatabaseConfig`. Previously a sibling `database-source.ts` duplicated
// this logic with hard-coded process.env reads — that file has been deleted.
// =============================================================================

// `dotenv.config` is idempotent and safe to call multiple times — it does not
// override values already present in process.env, so the running app (which
// loads .env in main.ts) is unaffected.
dotenv.config({ path: join(__dirname, '../../../.env') });

/**
 * Strip NestJS-only fields from `TypeOrmModuleOptions` so the result is a
 * pure `DataSourceOptions` accepted by `new DataSource(...)`.
 */
function toDataSourceOptions(options: TypeOrmModuleOptions): DataSourceOptions {
  const { autoLoadEntities: _autoLoadEntities, ...rest } =
    options as TypeOrmModuleOptions & { autoLoadEntities?: boolean };
  return rest as DataSourceOptions;
}

/**
 * `AppDataSource` — used exclusively by the TypeORM CLI for migrations.
 *
 * Construction is cheap: `new DataSource(...)` does NOT open a connection;
 * the CLI calls `.initialize()` itself. Using the same factory as the
 * NestJS app guarantees CLI/runtime parity (SSL, replication, pool sizing).
 */
export const AppDataSource = new DataSource(
  toDataSourceOptions(createDatabaseConfig(new ConfigService())),
);
