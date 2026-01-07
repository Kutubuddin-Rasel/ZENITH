import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * CoreQueueModule - Centralized BullMQ Configuration
 *
 * This global module provides:
 * 1. BullMQ Redis connection configuration
 * 2. All queue registrations in one place
 *
 * This breaks the IntegrationsModule ↔ QueueModule circular dependency
 * by centralizing queue config and letting domain modules just use processors.
 *
 * @see WORKER_MIGRATION_ARCH.md Section 2.1
 */
@Global()
@Module({
    imports: [
        // Centralized BullMQ Redis connection
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get('REDIS_HOST', 'localhost'),
                    port: config.get('REDIS_PORT', 6379),
                    password: config.get('REDIS_PASSWORD'),
                },
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 },
                    removeOnComplete: 100,
                    removeOnFail: false,
                },
            }),
            inject: [ConfigService],
        }),

        // All queues registered centrally
        BullModule.registerQueue(
            { name: 'audit-queue' },
            { name: 'notifications' },
            { name: 'integration-sync' },
        ),
    ],
    exports: [BullModule],
})
export class CoreQueueModule { }
