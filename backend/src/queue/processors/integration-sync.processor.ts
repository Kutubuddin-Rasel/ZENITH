import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IntegrationService } from '../../integrations/services/integration.service';
import { GitHubIntegrationService } from '../../integrations/services/github-integration.service';
import { SlackIntegrationService } from '../../integrations/services/slack-integration.service';
import { IntegrationType } from '../../integrations/entities/integration.entity';

export interface SyncJobData {
  integrationId: string;
  type: IntegrationType;
  resource?: string; // e.g., 'repository', 'channel'
  resourceId?: string; // e.g., repo name, channel ID
}

@Processor('integration-sync')
export class IntegrationSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(IntegrationSyncProcessor.name);

  constructor(
    private integrationService: IntegrationService,
    private githubService: GitHubIntegrationService,
    private slackService: SlackIntegrationService,
  ) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<any> {
    const { integrationId, type, resource, resourceId } = job.data;
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
            `Unsupported integration type for background sync: ${type}`,
          );
      }

      this.logger.log(`Sync job ${job.id} completed successfully`);
      return { success: true, timestamp: new Date() };
    } catch (error) {
      this.logger.error(`Sync job ${job.id} failed:`, error);
      throw error; // BullMQ will handle retries based on configuration
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
