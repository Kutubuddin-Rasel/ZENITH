import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
    const logger = new Logger('Worker');

    // Create NestJS application WITHOUT HTTP server
    const app = await NestFactory.createApplicationContext(WorkerModule, {
        logger: ['error', 'warn', 'log'],
    });

    // Enable shutdown hooks for graceful termination
    app.enableShutdownHooks();

    logger.log('🔧 Worker processes started');
    logger.log('📦 Queue consumers: audit-queue, notifications, integration-sync');

    // Handle graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
        process.on(signal, async () => {
            logger.log(`Received ${signal}, starting graceful shutdown...`);
            await app.close();
            logger.log('Worker shutdown complete');
            process.exit(0);
        });
    });
}

void bootstrap();
