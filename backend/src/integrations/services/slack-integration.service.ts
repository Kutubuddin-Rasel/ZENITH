import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData, MappedData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';
import { RateLimitService } from './rate-limit.service';
import { TokenManagerService } from './token-manager.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { BaseIntegrationService } from './base-integration.service';
import { UsersService } from '../../users/users.service';
import { ProjectsService } from '../../projects/projects.service';
import { IssuesService } from '../../issues/issues.service';
import { IssueType, IssuePriority } from '../../issues/entities/issue.entity';

export interface SlackMessage {
  channel: string;
  text: string;
  blocks?: unknown[];
  attachments?: unknown[];
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

// Internal interfaces for Slack API responses
interface SlackApiResponse {
  ok: boolean;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
}

interface SlackApiChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
}

interface SlackConversationsListResponse extends SlackApiResponse {
  channels?: SlackApiChannel[];
}

interface SlackApiUser {
  id: string;
  name: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: {
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    email?: string;
  };
}

interface SlackUsersListResponse extends SlackApiResponse {
  members?: SlackApiUser[];
}

interface SlackApiMessage {
  type: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channelId?: string; // We inject this
}

interface SlackHistoryResponse extends SlackApiResponse {
  messages?: SlackApiMessage[];
}

/**
 * Slack Interactive Payload for view submissions (modals)
 */
export interface SlackInteractivePayload {
  type: 'view_submission' | 'block_actions' | 'shortcut' | 'message_action';
  trigger_id: string;
  user: {
    id: string;
    username: string;
    name: string;
    team_id: string;
  };
  team: {
    id: string;
    domain: string;
  };
  view?: SlackModalView;
  api_app_id: string;
  token: string;
  response_urls?: Array<{
    block_id: string;
    action_id: string;
    channel_id: string;
    response_url: string;
  }>;
}

/**
 * Slack Modal View structure
 */
export interface SlackModalView {
  id: string;
  team_id: string;
  type: 'modal';
  callback_id: string;
  title: { type: 'plain_text'; text: string };
  submit?: { type: 'plain_text'; text: string };
  close?: { type: 'plain_text'; text: string };
  private_metadata?: string;
  state: {
    values: Record<
      string,
      Record<
        string,
        {
          type: string;
          value?: string;
          selected_option?: { value: string; text: { text: string } };
        }
      >
    >;
  };
}

@Injectable()
export class SlackIntegrationService extends BaseIntegrationService {
  protected readonly logger = new Logger(SlackIntegrationService.name);
  protected readonly source = 'slack';
  private readonly slackApiBase = 'https://slack.com/api';

  constructor(
    @InjectRepository(Integration)
    integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    searchIndexRepo: Repository<SearchIndex>,
    rateLimitService: RateLimitService,
    tokenManagerService: TokenManagerService,
    encryptionService: EncryptionService,
    private readonly usersService: UsersService,
    private readonly projectsService: ProjectsService,
    private readonly issuesService: IssuesService,
  ) {
    super(
      integrationRepo,
      externalDataRepo,
      searchIndexRepo,
      rateLimitService,
      tokenManagerService,
      encryptionService,
    );
  }

  /**
   * Helper to get access token from integration.
   * Uses inherited getDecryptedAccessToken from base class.
   */
  private getAccessToken(integration: Integration): string {
    return this.getDecryptedAccessToken(integration);
  }

  /**
   * Send a notification message to a Slack channel.
   * Uses proper token decryption for secure API calls.
   */
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

      const accessToken = this.getAccessToken(integration);
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

      const result = (await response.json()) as SlackApiResponse;

      if (!result.ok) {
        this.logger.error('Slack API error:', result.error);
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

      const accessToken = this.getAccessToken(integration);
      const allChannels: SlackChannel[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const url = new URL(`${this.slackApiBase}/conversations.list`);
        url.searchParams.append('types', 'public_channel,private_channel');
        url.searchParams.append('limit', '100');
        if (cursor) {
          url.searchParams.append('cursor', cursor);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const result =
          (await response.json()) as SlackConversationsListResponse;

        if (!result.ok) {
          throw new Error(`Slack API error: ${result.error}`);
        }

        const channels = (result.channels || []).map((channel) => ({
          id: channel.id,
          name: channel.name,
          is_private: channel.is_private,
          is_member: channel.is_member,
        }));

        allChannels.push(...channels);

        // Store channels in external data
        for (const channel of channels) {
          await this.storeExternalData(integrationId, 'channel', channel.id, {
            ...channel,
            syncedAt: new Date(),
          });
        }

        cursor = result.response_metadata?.next_cursor;
        hasMore = !!cursor;
      }

      this.logger.log(`Synced ${allChannels.length} Slack channels`);
      return allChannels;
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

      const accessToken = this.getAccessToken(integration);
      const allUsers: SlackUser[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const url = new URL(`${this.slackApiBase}/users.list`);
        url.searchParams.append('limit', '100');
        if (cursor) {
          url.searchParams.append('cursor', cursor);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const result = (await response.json()) as SlackUsersListResponse;

        if (!result.ok) {
          throw new Error(`Slack API error: ${result.error}`);
        }

        const users = (result.members || [])
          .filter((user) => !user.deleted && !user.is_bot)
          .map((user) => ({
            id: user.id,
            name: user.name,
            real_name: user.real_name || user.name,
            profile: {
              image_24: user.profile?.image_24 || '',
              image_32: user.profile?.image_32 || '',
              image_48: user.profile?.image_48 || '',
              image_72: user.profile?.image_72 || '',
              image_192: user.profile?.image_192 || '',
            },
          }));

        allUsers.push(...users);

        // Store users in external data
        for (const user of users) {
          await this.storeExternalData(integrationId, 'user', user.id, {
            ...user,
            syncedAt: new Date(),
          });
        }

        cursor = result.response_metadata?.next_cursor;
        hasMore = !!cursor;
      }

      this.logger.log(`Synced ${allUsers.length} Slack users`);
      return allUsers;
    } catch (error) {
      this.logger.error('Failed to sync Slack users:', error);
      throw error;
    }
  }

  async syncMessages(
    integrationId: string,
    channelId: string,
    limit = 100,
  ): Promise<SlackApiMessage[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.SLACK },
      });

      if (!integration) {
        throw new Error('Slack integration not found');
      }

      const accessToken = this.getAccessToken(integration);
      const allMessages: SlackApiMessage[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      // Get last sync time for incremental sync
      // We use the channel-specific last sync time if available, otherwise integration's last sync
      // Note: In a real implementation, we'd track per-channel sync times
      const oldest = integration.lastSyncAt
        ? (new Date(integration.lastSyncAt).getTime() / 1000).toString()
        : '0';

      while (hasMore) {
        const url = new URL(`${this.slackApiBase}/conversations.history`);
        url.searchParams.append('channel', channelId);
        url.searchParams.append('limit', limit.toString());
        url.searchParams.append('oldest', oldest); // Incremental sync
        if (cursor) {
          url.searchParams.append('cursor', cursor);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const result = (await response.json()) as SlackHistoryResponse;

        if (!result.ok) {
          // If channel not found or user not in channel, just log and return empty
          if (
            result.error === 'channel_not_found' ||
            result.error === 'not_in_channel'
          ) {
            this.logger.warn(
              `Cannot sync messages for channel ${channelId}: ${result.error}`,
            );
            return [];
          }
          throw new Error(`Slack API error: ${result.error}`);
        }

        const messages = (result.messages || []).map((message) => ({
          ...message,
          channelId,
          syncedAt: new Date(),
        }));

        allMessages.push(...messages);

        // Store messages in external data
        for (const message of messages) {
          // Only store messages with a timestamp (ts)
          if (message.ts) {
            await this.storeExternalData(
              integrationId,
              'message',
              message.ts,
              message,
            );
          }
        }

        cursor = result.response_metadata?.next_cursor;
        hasMore = !!cursor;
      }

      this.logger.log(
        `Synced ${allMessages.length} Slack messages from channel ${channelId}`,
      );
      return allMessages;
    } catch (error) {
      this.logger.error(
        `Failed to sync Slack messages for channel ${channelId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Syncs messages from all channels in parallel.
   */
  async syncAllChannelsHistory(integrationId: string): Promise<void> {
    try {
      // First sync channels to get the list
      const channels = await this.syncChannels(integrationId);

      // Filter for channels where the bot is a member
      const memberChannels = channels.filter((c) => c.is_member);

      this.logger.log(
        `Syncing history for ${memberChannels.length} channels in parallel...`,
      );

      // Process in batches to avoid rate limits
      const batchSize = 5; // Slack rate limits are stricter than GitHub

      for (let i = 0; i < memberChannels.length; i += batchSize) {
        const batch = memberChannels.slice(i, i + batchSize);

        await Promise.all(
          batch.map((channel) => this.syncMessages(integrationId, channel.id)),
        );

        this.logger.log(
          `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(memberChannels.length / batchSize)}`,
        );
      }

      // Update integration last sync time
      await this.integrationRepo.update(integrationId, {
        lastSyncAt: new Date(),
      });

      this.logger.log('Successfully synced history for all channels');
    } catch (error) {
      this.logger.error('Failed to sync all channels history:', error);
      throw error;
    }
  }

  async handleSlashCommand(command: SlackCommand): Promise<unknown> {
    try {
      this.logger.log(
        `Received Slack slash command: ${command.command} ${command.text}`,
      );

      // Parse command
      const [action, ...args] = command.text.split(' ');

      switch (action) {
        case 'create':
          // Open modal for issue creation (modern UX)
          return await this.openCreateIssueModal(command.trigger_id, command.team_id);
        case 'create-issue':
          return await this.handleCreateIssueCommand(command, args);
        case 'list-issues':
          return this.handleListIssuesCommand();
        case 'help':
          return this.handleHelpCommand();
        default:
          return {
            response_type: 'ephemeral',
            text: `Unknown command: ${action}. Use \`/zenith help\` or \`/zenith create\` for a popup form.`,
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

  /**
   * Resolve a Slack User ID to a Zenith User ID via email.
   */
  private async resolveZenithUser(
    integration: Integration,
    slackUserId: string,
  ): Promise<string | null> {
    // 1. Check if we have an existing mapping in ExternalData?
    // Doing a direct lookup is safer for now.

    // 2. Fetch user info from Slack
    const accessToken = this.getAccessToken(integration);
    try {
      const response = await fetch(
        `${this.slackApiBase}/users.info?user=${slackUserId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        user?: SlackApiUser;
        error?: string;
      };

      if (!result.ok || !result.user?.profile?.email) {
        this.logger.warn(
          `Could not fetch email for Slack user ${slackUserId}: ${result.error}`,
        );
        return null;
      }

      const email = result.user.profile.email;
      const zenithUser = await this.usersService.findOneByEmail(email);
      return zenithUser?.id || null;
    } catch (error) {
      this.logger.error(`Failed to resolve Slack user ${slackUserId}`, error);
      return null;
    }
  }

  private async handleCreateIssueCommand(
    command: SlackCommand,
    args: string[],
  ): Promise<unknown> {
    // Expect: <PROJECT_KEY> <TITLE> <DESCRIPTION>
    // To be lenient: check if first arg looks like a project key (UPPERCASE, alphanumeric).
    // If not, maybe use default project? No default implemented yet.

    if (args.length < 3) {
      return {
        response_type: 'ephemeral',
        text: '⚠️ Usage: `/zenith create-issue <PROJECT_KEY> <title> <description>`\nExample: `/zenith create-issue ZEN "Fix login page" Describes the bug...`',
      };
    }

    const projectKey = args[0].toUpperCase();

    // Quick heuristic: Project keys are usually short e.g. < 10 chars.
    // If user provided a title first, they probably forgot the key.

    // Extract title (handles quotes?)
    // Simple space splitting is done by caller usually, but here args is string[].
    // Title is args[1], Description is rest.
    const title = args[1];
    const description = args.slice(2).join(' ');

    // If title is quoted in original text, args parsing might be simple split.
    // We'll respect the args as passed.

    try {
      // 1. Find Integration (Organization Context)
      const integration = await this.integrationRepo
        .createQueryBuilder('integration')
        .where(`integration.type = :type`, { type: IntegrationType.SLACK })
        .andWhere(`integration.config ->> 'teamId' = :teamId`, {
          teamId: command.team_id,
        })
        .getOne();

      if (!integration) {
        return {
          response_type: 'ephemeral',
          text: '❌ Zenith integration not configured for this Slack workspace.',
        };
      }

      // 2. Find Project
      const project = await this.projectsService.findByKey(projectKey);
      if (!project) {
        return {
          response_type: 'ephemeral',
          text: `❌ Project with key *${projectKey}* not found.`,
        };
      }

      // 3. Resolve User
      const reporterId = await this.resolveZenithUser(
        integration,
        command.user_id,
      );
      if (!reporterId) {
        return {
          response_type: 'ephemeral',
          text: `❌ Could not match your Slack account (<@${command.user_id}>) to a Zenith user. Please ensure your emails match.`,
        };
      }

      // 4. Create Issue
      const issue = await this.issuesService.create(project.id, reporterId, {
        title,
        description,
        priority: undefined,
        type: IssueType.TASK,
      });

      // 5. Respond
      const issueNumber = issue.number
        ? `${project.key}-${issue.number}`
        : 'New Issue';
      // Construct Link (Mock frontend URL logic)
      // Assume FRONTEND_URL env is available
      const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const issueUrl = `${appUrl}/projects/${project.id}/issues/${issue.id}`;

      return {
        response_type: 'in_channel',
        text: `✅ Issue created: <${issueUrl}|${issueNumber}: ${title}>`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Issue Created*\n*<${issueUrl}|${issueNumber}: ${title}>*\n${description}\n*Created by:* <@${command.user_id}>`,
            },
          },
        ],
      };
    } catch (error) {
      this.logger.error('Error creating issue from Slack:', error);
      return {
        response_type: 'ephemeral',
        text: `❌ Error creating issue: ${(error as Error).message}`,
      };
    }
  }

  private handleListIssuesCommand(): unknown {
    // This would fetch issues from the project management system
    // For now, return a placeholder response
    return {
      response_type: 'ephemeral',
      text: '📋 Recent Issues:\n• Issue #1: Fix login bug\n• Issue #2: Add dark mode\n• Issue #3: Update documentation',
    };
  }

  private handleHelpCommand(): unknown {
    return {
      response_type: 'ephemeral',
      text: `*Zenith Bot Commands:*\n• \`/zenith create\` - Open a form to create an issue (recommended)\n• \`/zenith create-issue <PROJECT> <title> <description>\` - Create issue via text\n• \`/zenith list-issues\` - List recent issues\n• \`/zenith help\` - Show this help message`,
    };
  }

  /**
   * Open a Slack modal for creating an issue.
   * Uses Slack Block Kit for a modern, form-based UX.
   */
  async openCreateIssueModal(
    triggerId: string,
    teamId: string,
  ): Promise<{ response_type: string; text: string }> {
    try {
      // Find integration for this team
      const integration = await this.integrationRepo
        .createQueryBuilder('integration')
        .where(`integration.type = :type`, { type: IntegrationType.SLACK })
        .andWhere(`integration.config ->> 'teamId' = :teamId`, { teamId })
        .getOne();

      if (!integration) {
        return {
          response_type: 'ephemeral',
          text: '❌ Zenith integration not configured for this Slack workspace.',
        };
      }

      const accessToken = this.getAccessToken(integration);

      // Build Block Kit modal view
      const modalView = {
        type: 'modal',
        callback_id: 'create_issue_modal',
        private_metadata: JSON.stringify({ integrationId: integration.id }),
        title: { type: 'plain_text', text: 'Create Issue' },
        submit: { type: 'plain_text', text: 'Create' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'project_block',
            label: { type: 'plain_text', text: 'Project Key' },
            element: {
              type: 'plain_text_input',
              action_id: 'project_input',
              placeholder: { type: 'plain_text', text: 'e.g., ZEN' },
            },
          },
          {
            type: 'input',
            block_id: 'title_block',
            label: { type: 'plain_text', text: 'Title' },
            element: {
              type: 'plain_text_input',
              action_id: 'title_input',
              placeholder: { type: 'plain_text', text: 'Brief description of the issue' },
            },
          },
          {
            type: 'input',
            block_id: 'description_block',
            label: { type: 'plain_text', text: 'Description' },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'description_input',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Detailed description...' },
            },
          },
          {
            type: 'input',
            block_id: 'priority_block',
            label: { type: 'plain_text', text: 'Priority' },
            element: {
              type: 'static_select',
              action_id: 'priority_select',
              placeholder: { type: 'plain_text', text: 'Select priority' },
              options: [
                { text: { type: 'plain_text', text: '🔴 High' }, value: 'high' },
                { text: { type: 'plain_text', text: '🟡 Medium' }, value: 'medium' },
                { text: { type: 'plain_text', text: '⚪ Low' }, value: 'low' },
              ],
              initial_option: { text: { type: 'plain_text', text: '🟡 Medium' }, value: 'medium' },
            },
          },
          {
            type: 'input',
            block_id: 'type_block',
            label: { type: 'plain_text', text: 'Type' },
            element: {
              type: 'static_select',
              action_id: 'type_select',
              placeholder: { type: 'plain_text', text: 'Select type' },
              options: [
                { text: { type: 'plain_text', text: '🐛 Bug' }, value: 'bug' },
                { text: { type: 'plain_text', text: '✨ Feature' }, value: 'story' },
                { text: { type: 'plain_text', text: '📋 Task' }, value: 'task' },
                { text: { type: 'plain_text', text: '🔧 Improvement' }, value: 'task' },
              ],
              initial_option: { text: { type: 'plain_text', text: '📋 Task' }, value: 'task' },
            },
          },
        ],
      };

      // Call Slack API to open the modal
      const response = await fetch(`${this.slackApiBase}/views.open`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: modalView,
        }),
      });

      const result = (await response.json()) as SlackApiResponse;

      if (!result.ok) {
        this.logger.error('Failed to open Slack modal:', result.error);
        return {
          response_type: 'ephemeral',
          text: `❌ Failed to open modal: ${result.error}`,
        };
      }

      this.logger.log('Successfully opened create issue modal');
      // For modal opening, we return an empty response (Slack handles the modal)
      return { response_type: 'ephemeral', text: '' };
    } catch (error) {
      this.logger.error('Error opening create issue modal:', error);
      return {
        response_type: 'ephemeral',
        text: `❌ Error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Handle modal form submission from Slack.
   * Called when user clicks "Create" on the issue creation modal.
   */
  async handleViewSubmission(
    payload: SlackInteractivePayload,
  ): Promise<{ response_action?: string; errors?: Record<string, string> } | void> {
    try {
      if (payload.view?.callback_id !== 'create_issue_modal') {
        this.logger.warn(`Unknown modal callback_id: ${payload.view?.callback_id}`);
        return;
      }

      const values = payload.view.state.values;

      // Extract form values
      const projectKey = values.project_block?.project_input?.value?.toUpperCase() || '';
      const title = values.title_block?.title_input?.value || '';
      const description = values.description_block?.description_input?.value || '';
      const priority = values.priority_block?.priority_select?.selected_option?.value;
      const issueTypeValue = values.type_block?.type_select?.selected_option?.value;

      // Validate required fields
      if (!projectKey || projectKey.length < 2) {
        return {
          response_action: 'errors',
          errors: { project_block: 'Please enter a valid project key (e.g., ZEN)' },
        };
      }

      if (!title || title.length < 3) {
        return {
          response_action: 'errors',
          errors: { title_block: 'Title must be at least 3 characters' },
        };
      }

      // Get integration from metadata
      const metadata = JSON.parse(payload.view.private_metadata || '{}');
      const integrationId = metadata.integrationId;

      if (!integrationId) {
        this.logger.error('No integrationId in modal private_metadata');
        return;
      }

      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId },
      });

      if (!integration) {
        this.logger.error(`Integration ${integrationId} not found`);
        return;
      }

      // Find project
      const project = await this.projectsService.findByKey(projectKey);
      if (!project) {
        return {
          response_action: 'errors',
          errors: { project_block: `Project "${projectKey}" not found` },
        };
      }

      // Resolve Slack user to Zenith user
      const reporterId = await this.resolveZenithUser(integration, payload.user.id);
      if (!reporterId) {
        return {
          response_action: 'errors',
          errors: { project_block: 'Could not match your Slack account to a Zenith user. Ensure emails match.' },
        };
      }

      // Map issue type and priority
      const issueType = issueTypeValue === 'bug' ? IssueType.BUG
        : issueTypeValue === 'story' ? IssueType.STORY
          : IssueType.TASK;

      const issuePriority = priority === 'high' ? IssuePriority.HIGH
        : priority === 'low' ? IssuePriority.LOW
          : IssuePriority.MEDIUM;

      // Create the issue
      const issue = await this.issuesService.create(project.id, reporterId, {
        title,
        description,
        priority: issuePriority,
        type: issueType,
      });

      // Post confirmation message to user via Slack
      const accessToken = this.getAccessToken(integration);
      const issueNumber = issue.number ? `${project.key}-${issue.number}` : 'New Issue';
      const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const issueUrl = `${appUrl}/projects/${project.id}/issues/${issue.id}`;

      // Send DM to the user who created the issue
      await fetch(`${this.slackApiBase}/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: payload.user.id, // DM the user
          text: `✅ Issue created: <${issueUrl}|${issueNumber}: ${title}>`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *Issue Created*\n*<${issueUrl}|${issueNumber}: ${title}>*\n${description ? `_${description.substring(0, 100)}${description.length > 100 ? '...' : ''}_` : ''}`,
              },
            },
          ],
        }),
      });

      this.logger.log(`Issue ${issueNumber} created via Slack modal by ${payload.user.username}`);

      // Close modal successfully
      return;
    } catch (error) {
      this.logger.error('Error handling view submission:', error);
      return;
    }
  }

  /**
   * Maps Slack data to standard MappedData format.
   * Implements abstract method from BaseIntegrationService.
   */
  protected mapExternalData(
    type: string,
    data: Record<string, unknown>,
  ): MappedData | null {
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
        return null;
    }
  }
}
