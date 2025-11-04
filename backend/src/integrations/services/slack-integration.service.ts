import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';

export interface SlackMessage {
  channel: string;
  text: string;
  blocks?: any[];
  attachments?: any[];
  thread_ts?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  profile: {
    image_24: string;
    image_32: string;
    image_48: string;
    image_72: string;
    image_192: string;
  };
}

export interface SlackCommand {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

@Injectable()
export class SlackIntegrationService {
  private readonly logger = new Logger(SlackIntegrationService.name);
  private readonly slackApiBase = 'https://slack.com/api';

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
  ) {}

  async sendNotification(
    integrationId: string,
    message: SlackMessage,
  ): Promise<boolean> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.SLACK },
      });

      if (!integration || !integration.isActive) {
        throw new Error('Slack integration not found or inactive');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Slack access token not found');
      }

      const response = await fetch(`${this.slackApiBase}/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = (await response.json()) as Record<string, unknown>;

      if (!(result.ok as boolean)) {
        this.logger.error('Slack API error:', result.error as string);
        return false;
      }

      this.logger.log(`Message sent to Slack channel ${message.channel}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send Slack notification:', error);
      return false;
    }
  }

  async syncChannels(integrationId: string): Promise<SlackChannel[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.SLACK },
      });

      if (!integration) {
        throw new Error('Slack integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Slack access token not found');
      }

      const response = await fetch(
        `${this.slackApiBase}/conversations.list?types=public_channel,private_channel`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const result = (await response.json()) as Record<string, unknown>;

      if (!(result.ok as boolean)) {
        throw new Error(`Slack API error: ${result.error as string}`);
      }

      const channels = (
        (result.channels as Record<string, unknown>[]) || []
      ).map((channel: Record<string, unknown>) => ({
        id: channel.id as string,
        name: channel.name as string,
        is_private: channel.is_private as boolean,
        is_member: channel.is_member as boolean,
      }));

      // Store channels in external data
      for (const channel of channels) {
        await this.storeExternalData(integrationId, 'channel', channel.id, {
          ...channel,
          syncedAt: new Date(),
        });
      }

      this.logger.log(`Synced ${channels.length} Slack channels`);
      return channels;
    } catch (error) {
      this.logger.error('Failed to sync Slack channels:', error);
      throw error;
    }
  }

  async syncUsers(integrationId: string): Promise<SlackUser[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.SLACK },
      });

      if (!integration) {
        throw new Error('Slack integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Slack access token not found');
      }

      const response = await fetch(`${this.slackApiBase}/users.list`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = (await response.json()) as Record<string, unknown>;

      if (!(result.ok as boolean)) {
        throw new Error(`Slack API error: ${result.error as string}`);
      }

      const users = ((result.members as Record<string, unknown>[]) || [])
        .filter(
          (user: Record<string, unknown>) =>
            !(user.deleted as boolean) && !(user.is_bot as boolean),
        )
        .map((user: Record<string, unknown>) => ({
          id: user.id as string,
          name: user.name as string,
          real_name: user.real_name as string,
          profile: user.profile as {
            image_24: string;
            image_32: string;
            image_48: string;
            image_72: string;
            image_192: string;
          },
        }));

      // Store users in external data
      for (const user of users) {
        await this.storeExternalData(integrationId, 'user', user.id, {
          ...user,
          syncedAt: new Date(),
        });
      }

      this.logger.log(`Synced ${users.length} Slack users`);
      return users;
    } catch (error) {
      this.logger.error('Failed to sync Slack users:', error);
      throw error;
    }
  }

  async syncMessages(
    integrationId: string,
    channelId: string,
    limit = 100,
  ): Promise<any[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.SLACK },
      });

      if (!integration) {
        throw new Error('Slack integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Slack access token not found');
      }

      const response = await fetch(
        `${this.slackApiBase}/conversations.history?channel=${channelId}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const result = (await response.json()) as Record<string, unknown>;

      if (!(result.ok as boolean)) {
        throw new Error(`Slack API error: ${result.error as string}`);
      }

      const messages = (
        (result.messages as Record<string, unknown>[]) || []
      ).map((message: Record<string, unknown>) => ({
        ...message,
        channelId,
        syncedAt: new Date(),
      }));

      // Store messages in external data
      for (const message of messages) {
        await this.storeExternalData(
          integrationId,
          'message',
          (message as Record<string, unknown>).ts as string,
          message,
        );
      }

      this.logger.log(
        `Synced ${messages.length} Slack messages from channel ${channelId}`,
      );
      return messages;
    } catch (error) {
      this.logger.error('Failed to sync Slack messages:', error);
      throw error;
    }
  }

  async handleSlashCommand(command: SlackCommand): Promise<any> {
    try {
      this.logger.log(
        `Received Slack slash command: ${command.command} ${command.text}`,
      );

      // Parse command
      const [action, ...args] = command.text.split(' ');

      switch (action) {
        case 'create-issue':
          return await this.handleCreateIssueCommand(command, args);
        case 'list-issues':
          return this.handleListIssuesCommand();
        case 'help':
          return this.handleHelpCommand();
        default:
          return {
            response_type: 'ephemeral',
            text: `Unknown command: ${action}. Use \`/zenith help\` for available commands.`,
          };
      }
    } catch (error) {
      this.logger.error('Failed to handle Slack slash command:', error);
      return {
        response_type: 'ephemeral',
        text: `Error: ${(error as Error).message}`,
      };
    }
  }

  private handleCreateIssueCommand(command: SlackCommand, args: string[]): any {
    if (args.length < 2) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: `/zenith create-issue <title> <description>`',
      };
    }

    const title = args[0];
    const description = args.slice(1).join(' ');

    // This would create an issue in the project management system
    // For now, return a placeholder response
    return {
      response_type: 'in_channel',
      text: `✅ Issue created: *${title}*\n${description}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Issue Created*\n*Title:* ${title}\n*Description:* ${description}\n*Created by:* <@${command.user_id}>`,
          },
        },
      ],
    };
  }

  private handleListIssuesCommand(): any {
    // This would fetch issues from the project management system
    // For now, return a placeholder response
    return {
      response_type: 'ephemeral',
      text: '📋 Recent Issues:\n• Issue #1: Fix login bug\n• Issue #2: Add dark mode\n• Issue #3: Update documentation',
    };
  }

  private handleHelpCommand(): any {
    return {
      response_type: 'ephemeral',
      text: `*Zenith Bot Commands:*\n• \`/zenith create-issue <title> <description>\` - Create a new issue\n• \`/zenith list-issues\` - List recent issues\n• \`/zenith help\` - Show this help message`,
    };
  }

  private async storeExternalData(
    integrationId: string,
    type: string,
    externalId: string,
    data: any,
  ): Promise<void> {
    try {
      // Check if data already exists
      const existing = await this.externalDataRepo.findOne({
        where: {
          integrationId,
          externalId,
          externalType: type,
        },
      });

      const mappedData = this.mapSlackData(
        type,
        data as Record<string, unknown>,
      );

      if (existing) {
        existing.rawData = data as Record<string, unknown>;
        existing.mappedData = mappedData;
        existing.lastSyncAt = new Date();
        await this.externalDataRepo.save(existing);
      } else {
        const externalData = this.externalDataRepo.create({
          integrationId,
          externalId,
          externalType: type,
          rawData: data as Record<string, unknown>,
          mappedData: mappedData,
          lastSyncAt: new Date(),
        });
        await this.externalDataRepo.save(externalData);
      }

      // Update search index
      if (mappedData) {
        await this.updateSearchIndex(
          integrationId,
          type,
          externalId,
          mappedData,
        );
      }
    } catch (error) {
      this.logger.error('Failed to store external data:', error);
    }
  }

  private mapSlackData(
    type: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (type) {
      case 'channel':
        return {
          title: `#${data.name as string}`,
          content: `Channel: ${data.name as string}`,
          author: 'Slack',
          source: 'slack',
          url: `https://slack.com/channels/${data.id as string}`,
          metadata: {
            isPrivate: data.is_private as boolean,
            isMember: data.is_member as boolean,
          },
        };
      case 'user':
        return {
          title: (data.real_name as string) || (data.name as string),
          content: `User: ${(data.real_name as string) || (data.name as string)}`,
          author: 'Slack',
          source: 'slack',
          url: `https://slack.com/team/${data.id as string}`,
          metadata: {
            username: data.name as string,
            profileImage: (data.profile as Record<string, unknown>)
              ?.image_48 as string,
          },
        };
      case 'message':
        return {
          title: (data.text as string)?.substring(0, 100) || 'Message',
          content: (data.text as string) || '',
          author: (data.user as string) || 'Unknown',
          source: 'slack',
          url: `https://slack.com/channels/${data.channelId as string}/${data.ts as string}`,
          metadata: {
            channelId: data.channelId as string,
            timestamp: data.ts as string,
            threadTs: data.thread_ts as string,
          },
        };
      default:
        return null as unknown as Record<string, unknown>;
    }
  }

  private async updateSearchIndex(
    integrationId: string,
    type: string,
    externalId: string,
    mappedData: Record<string, unknown>,
  ): Promise<void> {
    try {
      const searchContent =
        `${mappedData.title as string} ${mappedData.content as string}`.toLowerCase();

      const existing = await this.searchIndexRepo.findOne({
        where: {
          integrationId,
          contentType: type,
        },
      });

      if (existing) {
        existing.title = mappedData.title as string;
        existing.content = mappedData.content as string;
        existing.metadata =
          (mappedData as { metadata?: Record<string, unknown> }).metadata || {};
        existing.searchVector = searchContent;
        existing.updatedAt = new Date();
        await this.searchIndexRepo.save(existing);
      } else {
        const searchIndex = this.searchIndexRepo.create({
          integrationId,
          contentType: type,
          title: mappedData.title as string,
          content: mappedData.content as string,
          metadata: mappedData.metadata as Record<string, unknown>,
          searchVector: searchContent,
        });
        await this.searchIndexRepo.save(searchIndex);
      }
    } catch (error) {
      this.logger.error('Failed to update search index:', error);
    }
  }
}
