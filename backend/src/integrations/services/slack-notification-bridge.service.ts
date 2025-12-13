import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Integration, IntegrationType } from '../entities/integration.entity';
import {
  SlackIntegrationService,
  SlackMessage,
} from './slack-integration.service';
import { Issue, IssuePriority } from '../../issues/entities/issue.entity';

/**
 * Event types that can be bridged to Slack.
 */
export enum ZenithEventType {
  ISSUE_CREATED = 'issue.created',
  ISSUE_UPDATED = 'issue.updated',
  ISSUE_ASSIGNED = 'issue.assigned',
  ISSUE_COMPLETED = 'issue.completed',
  SPRINT_STARTED = 'sprint.started',
  SPRINT_COMPLETED = 'sprint.completed',
  COMMENT_ADDED = 'comment.added',
  PR_MERGED = 'pr.merged',
}

/**
 * Service for bridging Zenith notifications to Slack.
 *
 * Listens to internal events and sends formatted messages to configured Slack channels.
 */
@Injectable()
export class SlackNotificationBridgeService implements OnModuleInit {
  private readonly logger = new Logger(SlackNotificationBridgeService.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    private slackService: SlackIntegrationService,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.logger.log('Slack Notification Bridge initialized');
  }

  /**
   * Get all active Slack integrations for an organization.
   */
  private async getSlackIntegrations(
    organizationId: string,
  ): Promise<Integration[]> {
    return this.integrationRepo.find({
      where: {
        type: IntegrationType.SLACK,
        organizationId,
        isActive: true,
      },
    });
  }

  /**
   * Get the default notification channel from integration config.
   */
  private getNotificationChannel(integration: Integration): string | null {
    const config = integration.config as Record<string, unknown> | null;
    return (
      (config?.notificationChannel as string) ||
      (config?.defaultChannel as string) ||
      null
    );
  }

  /**
   * Send a notification to all configured Slack integrations for an organization.
   */
  async broadcastToOrganization(
    organizationId: string,
    message: SlackMessage,
  ): Promise<void> {
    const integrations = await this.getSlackIntegrations(organizationId);

    for (const integration of integrations) {
      const channel =
        message.channel || this.getNotificationChannel(integration);
      if (!channel) {
        this.logger.warn(
          `No channel configured for Slack integration ${integration.id}`,
        );
        continue;
      }

      await this.slackService.sendNotification(integration.id, {
        ...message,
        channel,
      });
    }
  }

  // ============================================
  // Event Handlers for Zenith Events
  // ============================================

  @OnEvent(ZenithEventType.ISSUE_CREATED)
  async handleIssueCreated(payload: {
    issue: Issue;
    organizationId: string;
    createdBy: { name: string; email: string };
  }): Promise<void> {
    const { issue, organizationId, createdBy } = payload;

    const message: SlackMessage = {
      channel: '', // Will be set from integration config
      text: `New issue created: ${issue.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🆕 New Issue Created',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Title:*\n${issue.title}`,
            },
            {
              type: 'mrkdwn',
              text: `*Priority:*\n${this.formatPriority(issue.priority)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${issue.status}`,
            },
            {
              type: 'mrkdwn',
              text: `*Created by:*\n${createdBy.name}`,
            },
          ],
        },
        ...(issue.description
          ? [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Description:*\n${issue.description.substring(0, 200)}${issue.description.length > 200 ? '...' : ''}`,
                },
              },
            ]
          : []),
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Issue',
                emoji: true,
              },
              url: `${process.env.FRONTEND_URL}/issues/${issue.id}`,
            },
          ],
        },
      ],
    };

    await this.broadcastToOrganization(organizationId, message);
  }

  @OnEvent(ZenithEventType.ISSUE_ASSIGNED)
  async handleIssueAssigned(payload: {
    issue: Issue;
    organizationId: string;
    assignedTo: { name: string; email: string };
    assignedBy: { name: string };
  }): Promise<void> {
    const { issue, organizationId, assignedTo, assignedBy } = payload;

    const message: SlackMessage = {
      channel: '',
      text: `Issue assigned: ${issue.title} → ${assignedTo.name}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `👤 *${assignedBy.name}* assigned *${issue.title}* to *${assignedTo.name}*`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Priority: ${this.formatPriority(issue.priority)} | Status: ${issue.status}`,
            },
          ],
        },
      ],
    };

    await this.broadcastToOrganization(organizationId, message);
  }

  @OnEvent(ZenithEventType.ISSUE_COMPLETED)
  async handleIssueCompleted(payload: {
    issue: Issue;
    organizationId: string;
    completedBy: { name: string };
  }): Promise<void> {
    const { issue, organizationId, completedBy } = payload;

    const message: SlackMessage = {
      channel: '',
      text: `Issue completed: ${issue.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *${completedBy.name}* completed *${issue.title}*`,
          },
        },
      ],
    };

    await this.broadcastToOrganization(organizationId, message);
  }

  @OnEvent(ZenithEventType.SPRINT_STARTED)
  async handleSprintStarted(payload: {
    sprint: { id: string; name: string; goal?: string };
    organizationId: string;
    startedBy: { name: string };
  }): Promise<void> {
    const { sprint, organizationId, startedBy } = payload;

    const message: SlackMessage = {
      channel: '',
      text: `Sprint started: ${sprint.name}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 Sprint Started',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${sprint.name}*${sprint.goal ? `\n_Goal: ${sprint.goal}_` : ''}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Started by ${startedBy.name}`,
            },
          ],
        },
      ],
    };

    await this.broadcastToOrganization(organizationId, message);
  }

  @OnEvent(ZenithEventType.COMMENT_ADDED)
  async handleCommentAdded(payload: {
    issue: { id: string; title: string };
    comment: { content: string };
    organizationId: string;
    author: { name: string };
  }): Promise<void> {
    const { issue, comment, organizationId, author } = payload;

    const message: SlackMessage = {
      channel: '',
      text: `Comment on ${issue.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💬 *${author.name}* commented on *${issue.title}*:\n>${comment.content.substring(0, 150)}${comment.content.length > 150 ? '...' : ''}`,
          },
        },
      ],
    };

    await this.broadcastToOrganization(organizationId, message);
  }

  @OnEvent(ZenithEventType.PR_MERGED)
  async handlePRMerged(payload: {
    issueId: string;
    issueKey: number;
    projectKey: string;
    organizationId: string;
    prTitle: string;
    prUrl: string;
    mergedBy: string;
    repository: string;
  }) {
    // Construct Slack message
    const message: SlackMessage = {
      channel: '', // Broadcast determines channel
      text: `🚀 PR Merged: ${payload.prTitle} -> Fixed ${payload.projectKey}-${payload.issueKey}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚀 PR Merged: <${payload.prUrl}|${payload.prTitle}>*`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Repository:*\n${payload.repository}`,
            },
            {
              type: 'mrkdwn',
              text: `*Merged By:*\n${payload.mergedBy}`,
            },
            {
              type: 'mrkdwn',
              text: `*Issue Fixed:*\n${payload.projectKey}-${payload.issueKey}`,
            },
          ],
        },
      ],
    };

    await this.broadcastToOrganization(payload.organizationId, message);
  }
  // Helper Methods
  // ============================================

  private formatPriority(priority: IssuePriority): string {
    const icons: Record<IssuePriority, string> = {
      [IssuePriority.HIGHEST]: '🔴 Highest',
      [IssuePriority.HIGH]: '🟠 High',
      [IssuePriority.MEDIUM]: '🟡 Medium',
      [IssuePriority.LOW]: '🟢 Low',
      [IssuePriority.LOWEST]: '⚪ Lowest',
    };
    return icons[priority] || priority;
  }

  /**
   * Send a custom message to a specific channel.
   * Useful for direct API calls or testing.
   */
  async sendCustomNotification(
    integrationId: string,
    channel: string,
    text: string,
    blocks?: unknown[],
  ): Promise<boolean> {
    return this.slackService.sendNotification(integrationId, {
      channel,
      text,
      blocks,
    });
  }
}
