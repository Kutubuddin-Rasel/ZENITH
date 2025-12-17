import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Redis IoAdapter for Socket.io
 * Enables horizontal scaling of WebSocket connections across multiple server instances.
 *
 * When using this adapter:
 * - User connections are stored in Redis instead of in-memory
 * - Emitting to a room broadcasts to ALL connected instances via Redis pub/sub
 * - Users can connect to any backend instance and still receive all messages
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private pubClient: RedisClientType | undefined;
  private subClient: RedisClientType | undefined;

  constructor(
    app: INestApplication,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    const redisUrl = redisPassword
      ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
      : `redis://${redisHost}:${redisPort}`;

    this.pubClient = createClient({ url: redisUrl }) as RedisClientType;
    this.subClient = this.pubClient.duplicate() as RedisClientType;

    this.pubClient.on('error', (err) => {
      this.logger.error('Redis Pub Client Error:', err);
    });

    this.subClient.on('error', (err) => {
      this.logger.error('Redis Sub Client Error:', err);
    });

    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
      this.logger.log('✅ Redis WebSocket adapter connected');
    } catch (error) {
      this.logger.error('Failed to connect Redis WebSocket adapter:', error);
      throw error;
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3001',
        credentials: true,
        methods: ['GET', 'POST'],
      },
      // Connection state recovery for temporary disconnections
      connectionStateRecovery: {
        // How long to keep the session data
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        // Skip middlewares on recovery
        skipMiddlewares: true,
      },
      // Ping configuration for connection health
      pingTimeout: 20000,
      pingInterval: 25000,
    });

    if (this.adapterConstructor) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      server.adapter(this.adapterConstructor);
    } else {
      this.logger.warn(
        'Redis adapter not initialized, using default in-memory adapter',
      );
    }

    return server;
  }

  async close(): Promise<void> {
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }
    this.logger.log('Redis WebSocket adapter disconnected');
  }
}
