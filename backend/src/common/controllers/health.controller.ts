import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Integration,
  IntegrationStatus,
} from '../../integrations/entities/integration.entity';

/**
 * Health check controller for monitoring system health.
 *
 * Endpoints:
 * - GET /health - Overall system health
 * - GET /health/integrations - Integration-specific health
 * - GET /health/database - Database connectivity
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    private dataSource: DataSource,
  ) {}

  /**
   * Overall health check.
   */
  @Get()
  async getHealth(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    database: string;
    integrations: {
      total: number;
      active: number;
      healthy: number;
      degraded: number;
    };
  }> {
    const dbHealthy = await this.checkDatabase();
    const integrationStats = await this.getIntegrationStats();

    const overallHealthy =
      dbHealthy && integrationStats.degraded < integrationStats.total * 0.2; // <20% degraded

    return {
      status: overallHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealthy ? 'connected' : 'disconnected',
      integrations: integrationStats,
    };
  }

  /**
   * Integration-specific health check.
   */
  @Get('integrations')
  async getIntegrationHealth(): Promise<{
    status: string;
    integrations: Array<{
      id: string;
      type: string;
      name: string;
      healthStatus: string;
      lastSyncAt: Date | null;
      lastErrorAt: Date | null;
      lastErrorMessage: string | null;
    }>;
  }> {
    const integrations = await this.integrationRepo.find({
      select: [
        'id',
        'type',
        'name',
        'healthStatus',
        'lastSyncAt',
        'lastErrorAt',
        'lastErrorMessage',
      ],
    });

    const unhealthyCount = integrations.filter(
      (i) =>
        i.healthStatus === IntegrationStatus.ERROR ||
        i.healthStatus === IntegrationStatus.DISCONNECTED,
    ).length;

    return {
      status: unhealthyCount === 0 ? 'healthy' : 'degraded',
      integrations: integrations.map((i) => ({
        id: i.id,
        type: i.type,
        name: i.name,
        healthStatus: i.healthStatus as string,
        lastSyncAt: i.lastSyncAt,
        lastErrorAt: i.lastErrorAt,
        lastErrorMessage: i.lastErrorMessage,
      })),
    };
  }

  /**
   * Database connectivity check.
   */
  @Get('database')
  async getDatabaseHealth(): Promise<{
    status: string;
    connected: boolean;
    latency: number | null;
  }> {
    const start = Date.now();
    const connected = await this.checkDatabase();
    const latency = connected ? Date.now() - start : null;

    return {
      status: connected ? 'ok' : 'error',
      connected,
      latency,
    };
  }

  /**
   * Helper: Check database connectivity.
   */
  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Get integration statistics.
   */
  private async getIntegrationStats(): Promise<{
    total: number;
    active: number;
    healthy: number;
    degraded: number;
  }> {
    const integrations = await this.integrationRepo.find();

    return {
      total: integrations.length,
      active: integrations.filter((i) => i.isActive).length,
      healthy: integrations.filter(
        (i) => i.healthStatus === IntegrationStatus.HEALTHY,
      ).length,
      degraded: integrations.filter(
        (i) =>
          i.healthStatus === IntegrationStatus.ERROR ||
          i.healthStatus === IntegrationStatus.WARNING ||
          i.healthStatus === IntegrationStatus.DISCONNECTED,
      ).length,
    };
  }
}
