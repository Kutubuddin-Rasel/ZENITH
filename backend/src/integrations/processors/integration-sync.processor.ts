import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IntegrationService } from '../services/integration.service';
import { GitHubIntegrationService } from '../services/github-integration.service';
import { SlackIntegrationService } from '../services/slack-integration.service';
import { IntegrationType } from '../entities/integration.entity';
import { MetricsService } from '../../common/services/metrics.service';

export interface SyncJobData {
    integrationId: string;
    type: IntegrationType;
    resource?: string; // e.g., 'repository', 'channel'
    resourceId?: string; // e.g., repo name, channel ID
}

/**
 * Background processor for integration sync jobs.
 *
 * This processor:
 * 1. Consumes jobs from the 'integration-sync' BullMQ queue
 * 2. Routes to appropriate integration service (GitHub, Slack, etc.)
 * 3. Records Prometheus metrics for observability
 *
 * Metrics recorded:
 * - integration_sync_total (counter with success/failure status)
 * - integration_sync_duration_seconds (histogram)
 */
@Processor('integration-sync')
export class IntegrationSyncProcessor extends WorkerHost {
    private readonly logger = new Logger(IntegrationSyncProcessor.name);

    constructor(
        private readonly integrationService: IntegrationService,
        private readonly githubService: GitHubIntegrationService,
        private readonly slackService: SlackIntegrationService,
        private readonly metricsService: MetricsService,
    ) {
        super();
    }

    /**
     * Process a sync job from the queue.
     *
     * IMPORTANT: Metrics recording is wrapped in try/catch and must NEVER
     * cause the sync to fail. Observability must not affect business logic.
     */
    async process(job: Job<SyncJobData>): Promise<{ success: boolean; timestamp: Date }> {
        const { integrationId, type, resource, resourceId } = job.data;
        const startTime = Date.now();

        this.logger.log(
            `Processing sync job ${job.id} for integration ${integrationId} (${type})`,
        );

        try {
            switch (type) {
                case IntegrationType.GITHUB:
                    await this.processGitHubSync(integrationId, resource, resourceId);
                    break;
                case IntegrationType.SLACK:
                    await this.processSlackSync(integrationId, resource, resourceId);
                    break;
                default:
                    this.logger.warn(
                        `Unsupported integration type for background sync: ${String(type)}`,
                    );
            }

            // Record successful sync metrics
            const durationSeconds = (Date.now() - startTime) / 1000;
            this.recordSyncMetrics(type, 'success', durationSeconds);

            this.logger.log(
                `Sync job ${job.id} completed successfully in ${durationSeconds.toFixed(2)}s`,
            );
            return { success: true, timestamp: new Date() };
        } catch (error) {
            // Record failed sync metrics
            const durationSeconds = (Date.now() - startTime) / 1000;
            this.recordSyncMetrics(type, 'failure', durationSeconds);

            this.logger.error(
                `Sync job ${job.id} failed after ${durationSeconds.toFixed(2)}s:`,
                error,
            );
            throw error; // BullMQ will handle retries based on configuration
        }
    }

    /**
     * Records sync metrics safely.
     *
     * Wrapped in try/catch because metrics must NEVER break the sync operation.
     * If metrics fail, we log and continue - observability should not affect reliability.
     */
    private recordSyncMetrics(
        integrationType: IntegrationType,
        status: 'success' | 'failure',
        durationSeconds: number,
    ): void {
        try {
            this.metricsService.recordSync(
                integrationType.toLowerCase(),
                status,
                durationSeconds,
            );
        } catch (error) {
            // Never let metrics break the sync
            this.logger.warn('Failed to record sync metrics:', error);
        }
    }

    private async processGitHubSync(
        integrationId: string,
        resource?: string,
        resourceId?: string,
    ): Promise<void> {
        if (resource === 'repository' && resourceId) {
            // Sync specific repository
            await this.githubService.syncIssues(integrationId, resourceId);
            await this.githubService.syncPullRequests(integrationId, resourceId);
        } else {
            // Full sync
            await this.githubService.syncRepositories(integrationId);
        }
    }

    private async processSlackSync(
        integrationId: string,
        resource?: string,
        resourceId?: string,
    ): Promise<void> {
        if (resource === 'channel' && resourceId) {
            // Sync specific channel history
            await this.slackService.syncMessages(integrationId, resourceId);
        } else {
            // Full sync
            await this.slackService.syncChannels(integrationId);
            await this.slackService.syncUsers(integrationId);
            await this.slackService.syncAllChannelsHistory(integrationId);
        }
    }
}
