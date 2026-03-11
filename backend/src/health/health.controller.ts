import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { BullMQHealthIndicator } from './indicators/bullmq.health';
import { Public } from '../core/auth/decorators/public.decorator';
import { SuperAdminGuard } from '../core/auth/guards/super-admin.guard';
import {
  HEALTH_DEFAULTS,
  HEALTH_ENV_KEYS,
  safeParseInt,
  safeParseFloat,
} from './health.constants';

// ---------------------------------------------------------------------------
// Resolved Thresholds — parsed ONCE at construction, not per-request
// ---------------------------------------------------------------------------

interface HealthThresholds {
  /** Max V8 heap usage in bytes */
  heapBytes: number;
  /** Max RSS usage in bytes */
  rssBytes: number;
  /** Max disk usage as fraction (0.1 – 1.0) */
  diskPercent: number;
  /** Database ping timeout in milliseconds */
  dbTimeoutMs: number;
  /** BullMQ per-queue ping timeout in milliseconds */
  bullmqTimeoutMs: number;
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly thresholds: HealthThresholds;

  /**
   * Critical queues checked in readiness probe.
   * These are the queues whose failure would render the pod degraded —
   * if email or alerts can't process, the pod should stop receiving traffic.
   */
  private readonly criticalQueues: Queue[];

  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private redis: RedisHealthIndicator,
    private bullmq: BullMQHealthIndicator,
    private configService: ConfigService,
    // Inject all 7 registered queues
    @InjectQueue('audit-queue') auditQueue: Queue,
    @InjectQueue('notifications') notificationsQueue: Queue,
    @InjectQueue('integration-sync') integrationSyncQueue: Queue,
    @InjectQueue('email') emailQueue: Queue,
    @InjectQueue('webhook-delivery') webhookQueue: Queue,
    @InjectQueue('alerts-queue') alertsQueue: Queue,
    @InjectQueue('scheduled-reports-queue') scheduledReportsQueue: Queue,
  ) {
    // Collect all queues into a typed array for the health indicator
    this.criticalQueues = [
      auditQueue,
      notificationsQueue,
      integrationSyncQueue,
      emailQueue,
      webhookQueue,
      alertsQueue,
      scheduledReportsQueue,
    ];

    this.thresholds = this.resolveThresholds();

    this.logger.log(
      `Health thresholds resolved: heap=${this.thresholds.heapBytes / (1024 * 1024)}MB, ` +
      `rss=${this.thresholds.rssBytes / (1024 * 1024)}MB, ` +
      `disk=${(this.thresholds.diskPercent * 100).toFixed(0)}%, ` +
      `dbTimeout=${this.thresholds.dbTimeoutMs}ms, ` +
      `bullmqTimeout=${this.thresholds.bullmqTimeoutMs}ms`,
    );

    this.logger.log(
      `BullMQ health monitoring ${this.criticalQueues.length} queues: ` +
      this.criticalQueues.map((q) => q.name).join(', '),
    );
  }

  /**
   * Liveness Probe — Kubernetes uses this to know if pod should be restarted.
   * MUST be fast, MUST NOT check external dependencies.
   */
  @Public()
  @Get('live')
  @HealthCheck()
  checkLive() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', this.thresholds.heapBytes),
    ]);
  }

  /**
   * Readiness Probe — Kubernetes uses this to know if pod can receive traffic.
   * Checks ALL critical dependencies including BullMQ worker connections.
   */
  @Public()
  @Get('ready')
  @HealthCheck()
  checkReady() {
    return this.health.check([
      // Database connectivity
      () => this.db.pingCheck('database', { timeout: this.thresholds.dbTimeoutMs }),

      // Redis connectivity (critical for sessions, caching)
      () => this.redis.isHealthy('redis'),

      // BullMQ queue connections (critical for async job processing)
      () => this.bullmq.checkHealth(
        'bullmq',
        this.criticalQueues,
        this.thresholds.bullmqTimeoutMs,
      ),

      // Memory check (prevent serving when near OOM)
      () => this.memory.checkHeap('memory_heap', this.thresholds.heapBytes),
    ]);
  }

  /**
   * Detailed health for monitoring dashboards (not K8s).
   * SECURED: SuperAdmin only.
   */
  @UseGuards(SuperAdminGuard)
  @Get()
  @HealthCheck()
  checkDetailed() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: this.thresholds.dbTimeoutMs }),
      () => this.redis.isHealthy('redis'),
      () => this.bullmq.checkHealth(
        'bullmq',
        this.criticalQueues,
        this.thresholds.bullmqTimeoutMs,
      ),
      () => this.memory.checkHeap('memory_heap', this.thresholds.heapBytes),
      () => this.memory.checkRSS('memory_rss', this.thresholds.rssBytes),
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: this.thresholds.diskPercent,
        }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Private: Threshold Resolution (runs once at startup)
  // ---------------------------------------------------------------------------

  private resolveThresholds(): HealthThresholds {
    const heapMb = safeParseInt(
      this.configService.get<string>(HEALTH_ENV_KEYS.HEAP_MB),
      HEALTH_DEFAULTS.HEAP_MB,
      HEALTH_ENV_KEYS.HEAP_MB,
    );

    const rssMb = safeParseInt(
      this.configService.get<string>(HEALTH_ENV_KEYS.RSS_MB),
      HEALTH_DEFAULTS.RSS_MB,
      HEALTH_ENV_KEYS.RSS_MB,
    );

    const diskPercent = safeParseFloat(
      this.configService.get<string>(HEALTH_ENV_KEYS.DISK_PERCENT),
      HEALTH_DEFAULTS.DISK_PERCENT,
      HEALTH_ENV_KEYS.DISK_PERCENT,
      0.1,
      1.0,
    );

    const dbTimeoutMs = safeParseInt(
      this.configService.get<string>(HEALTH_ENV_KEYS.DB_TIMEOUT_MS),
      HEALTH_DEFAULTS.DB_TIMEOUT_MS,
      HEALTH_ENV_KEYS.DB_TIMEOUT_MS,
      100,
    );

    const bullmqTimeoutMs = safeParseInt(
      this.configService.get<string>(HEALTH_ENV_KEYS.BULLMQ_TIMEOUT_MS),
      HEALTH_DEFAULTS.BULLMQ_TIMEOUT_MS,
      HEALTH_ENV_KEYS.BULLMQ_TIMEOUT_MS,
      100,
    );

    return {
      heapBytes: heapMb * 1024 * 1024,
      rssBytes: rssMb * 1024 * 1024,
      diskPercent,
      dbTimeoutMs,
      bullmqTimeoutMs,
    };
  }
}
