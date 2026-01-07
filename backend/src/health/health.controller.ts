import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { Public } from '../core/auth/decorators/public.decorator';
import { SuperAdminGuard } from '../core/auth/guards/super-admin.guard';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  /**
   * Liveness Probe - Kubernetes uses this to know if pod should be restarted
   * MUST be fast, MUST NOT check external dependencies
   */
  @Public()
  @Get('live')
  @HealthCheck()
  checkLive() {
    return this.health.check([
      // Only checks if the process is running and responding
      // Memory heap check prevents OOM situations
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024), // 500MB max
    ]);
  }

  /**
   * Readiness Probe - Kubernetes uses this to know if pod can receive traffic
   * Checks ALL critical dependencies
   */
  @Public()
  @Get('ready')
  @HealthCheck()
  checkReady() {
    return this.health.check([
      // Database connectivity
      () => this.db.pingCheck('database', { timeout: 1500 }),

      // Redis connectivity (critical for sessions, caching, BullMQ)
      () => this.redis.isHealthy('redis'),

      // Memory check (prevent serving when near OOM)
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
    ]);
  }

  /**
   * Detailed health for monitoring dashboards (not K8s)
   * SECURED: SuperAdmin only
   */
  @UseGuards(SuperAdminGuard)
  @Get()
  @HealthCheck()
  checkDetailed() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
      () => this.redis.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024), // 1GB RSS
      () =>
        this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }
}
