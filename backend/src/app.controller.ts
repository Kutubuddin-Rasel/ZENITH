import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Controller()
export class AppController {
  private redis: Redis;

  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    // Create Redis client for health check
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('test-public')
  testPublic(): string {
    return 'This is a public endpoint';
  }

  @Get('test-simple')
  testSimple(): string {
    return 'This is a simple endpoint without guards';
  }

  /**
   * Health check endpoint for container orchestration (Kubernetes, Docker)
   * Returns 200 if database and Redis are connected, 503 otherwise
   */
  @Public()
  @Get('health')
  async health(): Promise<{
    status: string;
    timestamp: number;
    uptime: number;
    database: string;
    redis: string;
  }> {
    let dbStatus = 'disconnected';
    let redisStatus = 'disconnected';

    // Check PostgreSQL
    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }

    // Check Redis
    try {
      await this.redis.ping();
      redisStatus = 'connected';
    } catch {
      redisStatus = 'error';
    }

    const allHealthy = dbStatus === 'connected' && redisStatus === 'connected';

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      uptime: process.uptime(),
      database: dbStatus,
      redis: redisStatus,
    };
  }
}

