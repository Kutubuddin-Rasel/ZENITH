import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const createDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get('NODE_ENV') === 'production';

  // Configure pg-pool logging function
  const pgLogFunction = (msg: string) => {
    if (configService.get('DB_QUERY_LOG', false)) {
      console.log(`[pg-pool] ${msg}`);
    }
  };

  return {
    type: 'postgres',
    host: configService.get('DATABASE_HOST', 'localhost'),
    port: configService.get('DATABASE_PORT', 5432),
    username: configService.get('DATABASE_USER', 'postgres'),
    password: configService.get('DATABASE_PASS', 'password'),
    database: configService.get('DATABASE_NAME', 'zenith'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: !isProduction, // Never use synchronize in production
    logging: configService.get('DB_LOGGING', false),
    ssl: isProduction ? { rejectUnauthorized: false } : false,

    // Direct fix for pg-pool
    poolErrorHandler: (err: Error) => {
      console.error('PostgreSQL pool error:', err);
    },

    // Connection Pool Configuration
    extra: {
      // Connection pool settings
      max: configService.get('DB_POOL_MAX', 20), // Maximum number of connections
      min: configService.get('DB_POOL_MIN', 5), // Minimum number of connections
      acquire: configService.get('DB_POOL_ACQUIRE', 30000), // Maximum time to acquire connection
      idle: configService.get('DB_POOL_IDLE', 10000), // Maximum idle time

      // Connection timeout settings
      connectionTimeoutMillis: configService.get('DB_CONNECTION_TIMEOUT', 2000),
      idleTimeoutMillis: configService.get('DB_IDLE_TIMEOUT', 30000),
      query_timeout: configService.get('DB_QUERY_TIMEOUT', 60000),

      // Performance settings
      statement_timeout: configService.get('DB_STATEMENT_TIMEOUT', 30000),
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
    maxQueryExecutionTime: configService.get('DB_MAX_QUERY_TIME', 5000), // 5 seconds
    dropSchema: false,
    autoLoadEntities: true,

    // Replication settings for read/write splitting
    replication: isProduction
      ? {
          master: {
            host: configService.get(
              'DB_MASTER_HOST',
              configService.get('DB_HOST'),
            ),
            port: configService.get(
              'DB_MASTER_PORT',
              configService.get('DB_PORT'),
            ),
            username: configService.get(
              'DB_MASTER_USERNAME',
              configService.get('DB_USERNAME'),
            ),
            password: configService.get(
              'DB_MASTER_PASSWORD',
              configService.get('DB_PASSWORD'),
            ),
            database: configService.get(
              'DB_MASTER_NAME',
              configService.get('DB_NAME'),
            ),
          },
          slaves: [
            {
              host: configService.get(
                'DB_SLAVE_HOST',
                configService.get('DB_HOST'),
              ),
              port: configService.get(
                'DB_SLAVE_PORT',
                configService.get('DB_PORT'),
              ),
              username: configService.get(
                'DB_SLAVE_USERNAME',
                configService.get('DB_USERNAME'),
              ),
              password: configService.get(
                'DB_SLAVE_PASSWORD',
                configService.get('DB_PASSWORD'),
              ),
              database: configService.get(
                'DB_SLAVE_NAME',
                configService.get('DB_NAME'),
              ),
            },
          ],
        }
      : undefined,
  };
};

export const createRedisConfig = (configService: ConfigService) => {
  return {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),
    password: configService.get('REDIS_PASSWORD'),
    db: configService.get('REDIS_DB', 0),
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
    // Monitoring
    onError: (err: Error) => {
      console.error('Redis connection error:', err);
    },
    onConnect: () => {
      console.log('Redis connected successfully');
    },
    onReady: () => {
      console.log('Redis ready for operations');
    },
    onReconnecting: () => {
      console.log('Redis reconnecting...');
    },
    onEnd: () => {
      console.log('Redis connection ended');
    },
  };
};
