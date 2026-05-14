import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';
import { DataSource } from 'typeorm';
import { CACHE_HEALTH_TOKEN } from './cache/constants/cache.tokens';
import { ICacheHealth } from './cache/interfaces/cache.interfaces';
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    @Inject(CACHE_HEALTH_TOKEN) private readonly cacheHealth: ICacheHealth,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // REMOVED: test-public and test-simple endpoints (Phase 3 - Security Remediation)
  // These were trivial debug endpoints exposing unnecessary attack surface.
  // If local testing is needed, use the /health endpoint or create a DevController.

  /**
   * Health check endpoint for container orchestration (Kubernetes, Docker)
   * Returns 200 if database and Redis are connected, 503 otherwise
   *
   * REFACTORED (Phase 4): Now uses cache layer singleton instead of creating
   * a new Redis connection per health check. This prevents connection leaks
   * under high load (e.g., 1000 health checks/sec = 0 new sockets now).
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

    // Check Redis using shared connection pool (cache layer)
    try {
      await this.cacheHealth.ping();
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
