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

export interface TeamsChannel {
  id: string;
  displayName: string;
  description: string;
  webUrl: string;
  membershipType: string;
  createdDateTime: string;
  lastMessageDateTime: string;
}

export interface TeamsMessage {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  body: {
    content: string;
    contentType: string;
  };
  from: {
    user: {
      displayName: string;
      id: string;
    };
  };
  channelIdentity: {
    channelId: string;
    teamId: string;
  };
  importance: string;
  messageType: string;
  webUrl: string;
}

export interface TeamsMeeting {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  joinUrl: string;
  participants: Array<{
    displayName: string;
    email: string;
  }>;
  organizer: {
    displayName: string;
    email: string;
  };
  webUrl: string;
}

export interface TeamsNotification {
  title: string;
  body: string;
  channelId: string;
  webhookUrl?: string;
  mentions?: string[];
}

// interface TeamsAttendee {
//   emailAddress: {
//     name: string;
//     address: string;
//   };
// }

// interface TeamsEvent {
//   id: string;
//   subject: string;
//   start: {
//     dateTime: string;
//   };
//   end: {
//     dateTime: string;
//   };
//   onlineMeeting: {
//     joinUrl: string;
//   };
//   attendees?: TeamsAttendee[];
//   organizer: {
//     emailAddress: {
//       name: string;
//       address: string;
//     };
//   };
//   webLink: string;
// }

// interface TeamsMeetingData {
//   subject: string;
//   startDateTime: string;
//   endDateTime: string;
//   attendees: string[];
// }

// interface TeamsWebhookData extends Record<string, unknown> {
//   type: string;
//   data: Record<string, unknown>;
//   displayName?: string;
//   description?: string;
//   webUrl?: string;
//   membershipType?: string;
//   teamId?: string;
//   createdDateTime?: string;
//   lastMessageDateTime?: string;
//   body?: {
//     content?: string;
//   };
//   syncedAt?: Date;
// }

@Injectable()
export class MicrosoftTeamsIntegrationService extends BaseIntegrationService {
  protected readonly logger = new Logger(MicrosoftTeamsIntegrationService.name);
  protected readonly source = 'microsoft_teams';
  private readonly graphApiBase = 'https://graph.microsoft.com/v1.0';

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

  async syncChannels(
    integrationId: string,
    teamId: string,
  ): Promise<TeamsChannel[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.MICROSOFT_TEAMS },
      });

      if (!integration) {
        throw new Error('Microsoft Teams integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Microsoft Teams access token not found');
      }

      const response = await fetch(
        `${this.graphApiBase}/teams/${teamId}/channels`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Microsoft Graph API error: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const channels = (data.value as Record<string, unknown>[]) || [];
      const syncedChannels: TeamsChannel[] = [];

      for (const channel of channels) {
        syncedChannels.push(channel as unknown as TeamsChannel);
        await this.storeExternalData(
          integrationId,
          'channel',
          channel.id as string,
          {
            ...channel,
            teamId,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(
        `Synced ${syncedChannels.length} Microsoft Teams channels`,
      );
      return syncedChannels;
    } catch (error) {
      this.logger.error('Failed to sync Microsoft Teams channels:', error);
      throw error;
    }
  }

  async syncMessages(
    integrationId: string,
    teamId: string,
    channelId: string,
  ): Promise<TeamsMessage[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.MICROSOFT_TEAMS },
      });

      if (!integration) {
        throw new Error('Microsoft Teams integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Microsoft Teams access token not found');
      }

      const response = await fetch(
        `${this.graphApiBase}/teams/${teamId}/channels/${channelId}/messages?$top=50&$orderby=createdDateTime desc`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Microsoft Graph API error: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const messages = (data.value as Record<string, unknown>[]) || [];
      const syncedMessages: TeamsMessage[] = [];

      for (const message of messages) {
        syncedMessages.push(message as unknown as TeamsMessage);
        await this.storeExternalData(
          integrationId,
          'message',
          message.id as string,
          {
            ...message,
            teamId,
            channelId,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(
        `Synced ${syncedMessages.length} Microsoft Teams messages`,
      );
      return syncedMessages;
    } catch (error) {
      this.logger.error('Failed to sync Microsoft Teams messages:', error);
      throw error;
    }
  }

  async syncMeetings(
    integrationId: string,
    userId: string,
  ): Promise<TeamsMeeting[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.MICROSOFT_TEAMS },
      });

      if (!integration) {
        throw new Error('Microsoft Teams integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Microsoft Teams access token not found');
      }

      const startTime = new Date();
      const endTime = new Date();
      endTime.setDate(endTime.getDate() + 30); // Next 30 days

      const response = await fetch(
        `${this.graphApiBase}/users/${userId}/calendar/events?` +
          `$filter=start/dateTime ge '${startTime.toISOString()}' and start/dateTime le '${endTime.toISOString()}'&` +
          `$orderby=start/dateTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Microsoft Graph API error: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const events = (data.value as Record<string, unknown>[]) || [];
      const syncedMeetings: TeamsMeeting[] = [];

      for (const event of events) {
        // Filter for Teams meetings
        if ((event.onlineMeeting as Record<string, unknown>)?.joinUrl) {
          const meeting: TeamsMeeting = {
            id: event.id as string,
            subject: event.subject as string,
            startTime: (event.start as Record<string, unknown>)
              .dateTime as string,
            endTime: (event.end as Record<string, unknown>).dateTime as string,
            joinUrl: (event.onlineMeeting as Record<string, unknown>)
              .joinUrl as string,
            participants: (
              (event.attendees as Record<string, unknown>[]) || []
            ).map((a: Record<string, unknown>) => ({
              displayName: (a.emailAddress as Record<string, unknown>)
                .name as string,
              email: (a.emailAddress as Record<string, unknown>)
                .address as string,
            })),
            organizer: {
              displayName: (
                (event.organizer as Record<string, unknown>)
                  .emailAddress as Record<string, unknown>
              ).name as string,
              email: (
                (event.organizer as Record<string, unknown>)
                  .emailAddress as Record<string, unknown>
              ).address as string,
            },
            webUrl: event.webLink as string,
          };

          syncedMeetings.push(meeting);
          await this.storeExternalData(
            integrationId,
            'meeting',
            event.id as string,
            {
              ...meeting,
              syncedAt: new Date(),
            },
          );
        }
      }

      this.logger.log(
        `Synced ${syncedMeetings.length} Microsoft Teams meetings`,
      );
      return syncedMeetings;
    } catch (error) {
      this.logger.error('Failed to sync Microsoft Teams meetings:', error);
      throw error;
    }
  }

  async sendNotification(
    integrationId: string,
    notification: TeamsNotification,
  ): Promise<void> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.MICROSOFT_TEAMS },
      });

      if (!integration) {
        throw new Error('Microsoft Teams integration not found');
      }

      const webhookUrl =
        notification.webhookUrl || integration.config.webhookUrl;
      if (!webhookUrl) {
        throw new Error('Teams webhook URL not configured');
      }

      const message: any = {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: notification.title,
        themeColor: '0078D4',
        sections: [
          {
            activityTitle: notification.title,
            activitySubtitle: 'Zenith Project Management',
            text: notification.body,
            markdown: true,
            facts: [],
          },
        ],
      };

      // Add mentions if provided
      if (notification.mentions && notification.mentions.length > 0) {
        (
          (message as Record<string, unknown>).sections as Record<
            string,
            unknown
          >[]
        )[0].facts = [
          {
            name: 'Mentions',
            value: notification.mentions
              .map((mention) => `<at>${mention}</at>`)
              .join(' '),
          },
        ];
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Teams webhook error: ${response.status}`);
      }

      this.logger.log(
        `Sent Teams notification to channel ${notification.channelId}`,
      );
    } catch (error) {
      this.logger.error('Failed to send Teams notification:', error);
      throw error;
    }
  }

  async createMeeting(
    integrationId: string,
    meetingData: Partial<TeamsMeeting>,
  ): Promise<TeamsMeeting> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.MICROSOFT_TEAMS },
      });

      if (!integration) {
        throw new Error('Microsoft Teams integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Microsoft Teams access token not found');
      }

      const event = {
        subject: meetingData.subject,
        start: {
          dateTime: meetingData.startTime,
          timeZone: 'UTC',
        },
        end: {
          dateTime: meetingData.endTime,
          timeZone: 'UTC',
        },
        attendees:
          meetingData.participants?.map((p) => ({
            emailAddress: {
              address: p.email,
              name: p.displayName,
            },
          })) || [],
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      };

      const response = await fetch(`${this.graphApiBase}/me/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Microsoft Graph API error: ${response.status}`);
      }

      const createdEvent = (await response.json()) as Record<string, unknown>;
      this.logger.log(`Created Teams meeting: ${createdEvent.id as string}`);

      return {
        id: createdEvent.id as string,
        subject: createdEvent.subject as string,
        startTime: (createdEvent.start as Record<string, unknown>)
          .dateTime as string,
        endTime: (createdEvent.end as Record<string, unknown>)
          .dateTime as string,
        joinUrl: (createdEvent.onlineMeeting as Record<string, unknown>)
          .joinUrl as string,
        participants: (
          (createdEvent.attendees as Record<string, unknown>[]) || []
        ).map((a: Record<string, unknown>) => ({
          displayName: (a.emailAddress as Record<string, unknown>)
            .name as string,
          email: (a.emailAddress as Record<string, unknown>).address as string,
        })),
        organizer: {
          displayName: (
            (createdEvent.organizer as Record<string, unknown>)
              .emailAddress as Record<string, unknown>
          ).name as string,
          email: (
            (createdEvent.organizer as Record<string, unknown>)
              .emailAddress as Record<string, unknown>
          ).address as string,
        },
        webUrl: createdEvent.webLink as string,
      };
    } catch (error) {
      this.logger.error('Failed to create Teams meeting:', error);
      throw error;
    }
  }

  /**
   * Maps Microsoft Teams data to standard MappedData format.
   * Implements abstract method from BaseIntegrationService.
   */
  protected mapExternalData(
    type: string,
    data: Record<string, unknown>,
  ): MappedData | null {
    switch (type) {
      case 'channel':
        return {
          title: (data.displayName as string) || 'Channel',
          content: (data.description as string) || '',
          author: 'Microsoft Teams',
          source: 'microsoft_teams',
          url: (data.webUrl as string) || '',
          metadata: {
            membershipType: data.membershipType,
            teamId: data.teamId,
            createdDateTime: data.createdDateTime,
            lastMessageDateTime: data.lastMessageDateTime,
          },
        };
      case 'message': {
        const body = data.body as { content?: string } | undefined;
        const from = data.from as
          | { user?: { displayName?: string } }
          | undefined;
        const channelIdentity = data.channelIdentity as
          | { teamId?: string; channelId?: string }
          | undefined;
        return {
          title: body?.content?.substring(0, 100) || 'Message',
          content: body?.content || '',
          author: from?.user?.displayName || 'Unknown',
          source: 'microsoft_teams',
          url: (data.webUrl as string) || '',
          metadata: {
            messageType: data.messageType,
            importance: data.importance,
            teamId: channelIdentity?.teamId,
            channelId: channelIdentity?.channelId,
            createdDateTime: data.createdDateTime,
          },
        };
      }
      case 'meeting': {
        const organizer = data.organizer as
          | { displayName?: string; email?: string }
          | undefined;
        const participants = data.participants as
          | { email: string }[]
          | undefined;
        return {
          title: (data.subject as string) || 'Meeting',
          content: `Meeting from ${data.startTime as string} to ${data.endTime as string}`,
          author: organizer?.displayName || 'Unknown',
          source: 'microsoft_teams',
          url: (data.webUrl as string) || '',
          metadata: {
            startTime: data.startTime,
            endTime: data.endTime,
            joinUrl: data.joinUrl,
            participants:
              participants?.map((p: { email: string }) => p.email) || [],
            organizer: organizer?.email,
          },
        };
      }
      default:
        return null;
    }
  }
}
