import {
    Module,
    OnApplicationShutdown,
    Logger,
    forwardRef,
    Inject,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { Queue, Worker } from 'bullmq';
import { ModuleRef } from '@nestjs/core';

// Database config
import { createDatabaseConfig } from './database/config/database.config';

// ===========================================
// AUDIT QUEUE DEPENDENCIES
// ===========================================
import { AuditLogsWorker } from './audit/audit-logs.worker';
import { ClickHouseClient } from './audit/clickhouse.client';

// ===========================================
// NOTIFICATION QUEUE DEPENDENCIES
// ===========================================
import { NotificationsConsumer } from './notifications/processors/notifications.consumer';
import { DailyDigestProcessor } from './notifications/processors/daily-digest.processor';
import { SnoozeWorker } from './notifications/processors/snooze.worker';
import { BriefingService } from './notifications/services/briefing.service';
import { SmartDigestService } from './notifications/services/smart-digest.service';
import { NotificationsService } from './notifications/notifications.service';
import { Notification } from './notifications/entities/notification.entity';

// ===========================================
// INTEGRATION SYNC QUEUE DEPENDENCIES
// ===========================================
import { IntegrationSyncProcessor } from './queue/processors/integration-sync.processor';
import { IntegrationService } from './integrations/services/integration.service';
import { GitHubIntegrationService } from './integrations/services/github-integration.service';
import { SlackIntegrationService } from './integrations/services/slack-integration.service';
import { TokenManagerService } from './integrations/services/token-manager.service';
import { Integration } from './integrations/entities/integration.entity';
import { ExternalData } from './integrations/entities/external-data.entity';
import { SyncLog } from './integrations/entities/sync-log.entity';
import { Issue } from './issues/entities/issue.entity';
import { Project } from './projects/entities/project.entity';
import { User } from './users/entities/user.entity';

// ===========================================
// SHARED MODULES
// ===========================================
import { CacheModule } from './cache/cache.module';

/**
 * WorkerNotificationsGateway - Stub for worker context
 * Workers don't need WebSocket broadcast, but NotificationsService expects it.
 * This stub satisfies the dependency while doing nothing.
 */
class WorkerNotificationsGateway {
    sendToUser(_userId: string, _payload: any) {
        // No-op in worker context - WebSocket is handled by API container
    }
    sendDeletionToUser(_userId: string, _ids: string[]) {
        // No-op
    }
    sendUpdateToUser(_userId: string, _payload: any) {
        // No-op
    }
}

const QUEUE_NAMES = ['audit-queue', 'notifications', 'integration-sync'];

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ScheduleModule.forRoot(),

        // Database connection (same config as API)
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: createDatabaseConfig,
        }),

        // Entity repositories needed by workers
        TypeOrmModule.forFeature([
            Notification,
            Integration,
            ExternalData,
            SyncLog,
            Issue,
            Project,
            User,
        ]),

        // BullMQ connection
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                connection: {
                    host: configService.get('REDIS_HOST', 'localhost'),
                    port: configService.get('REDIS_PORT', 6379),
                    password: configService.get('REDIS_PASSWORD'),
                },
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 1000,
                    },
                    removeOnComplete: 100, // Keep last 100 completed jobs
                    removeOnFail: false, // Keep failed jobs for inspection
                },
            }),
            inject: [ConfigService],
        }),

        // Register queues
        BullModule.registerQueue(
            { name: 'audit-queue' },
            { name: 'notifications' },
            { name: 'integration-sync' },
        ),

        // Shared modules
        CacheModule,
    ],
    providers: [
        // ===========================================
        // AUDIT QUEUE WORKERS
        // ===========================================
        AuditLogsWorker,
        ClickHouseClient,

        // ===========================================
        // NOTIFICATION QUEUE WORKERS
        // ===========================================
        NotificationsConsumer,
        DailyDigestProcessor,
        SnoozeWorker,
        BriefingService,
        SmartDigestService,
        NotificationsService,
        // Stub gateway for worker context
        {
            provide: 'NotificationsGateway',
            useClass: WorkerNotificationsGateway,
        },
        {
            provide: 'NOTIFICATIONS_GATEWAY',
            useClass: WorkerNotificationsGateway,
        },

        // ===========================================
        // INTEGRATION SYNC WORKERS
        // ===========================================
        IntegrationSyncProcessor,
        IntegrationService,
        GitHubIntegrationService,
        SlackIntegrationService,
        TokenManagerService,
    ],
})
export class WorkerModule implements OnApplicationShutdown {
    private readonly logger = new Logger(WorkerModule.name);

    constructor(private readonly moduleRef: ModuleRef) { }

    async onApplicationShutdown(signal?: string) {
        this.logger.log(`🛑 Worker shutdown signal received: ${signal}`);

        // Pause all queues to stop accepting new jobs
        for (const queueName of QUEUE_NAMES) {
            try {
                const queue = this.moduleRef.get<Queue>(getQueueToken(queueName), {
                    strict: false,
                });

                if (queue) {
                    this.logger.log(`Pausing queue: ${queueName}`);
                    await queue.pause();

                    // Get active job count
                    const activeCount = await queue.getActiveCount();
                    this.logger.log(`Queue ${queueName} has ${activeCount} active jobs`);
                }
            } catch (error) {
                this.logger.warn(`Failed to pause queue ${queueName}:`, error);
            }
        }

        this.logger.log('All queues paused, waiting for active jobs to complete...');

        // Give workers time to finish current jobs (configurable via env)
        const gracePeriod = parseInt(process.env.WORKER_GRACE_PERIOD_MS || '10000', 10);
        await new Promise((resolve) => setTimeout(resolve, gracePeriod));

        this.logger.log('✅ Worker shutdown complete');
    }
}
