import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees: Array<{
    email: string;
    displayName: string;
    responseStatus: string;
  }>;
  creator: {
    email: string;
    displayName: string;
  };
  organizer: {
    email: string;
    displayName: string;
  };
  location: string;
  htmlLink: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  description: string;
  webViewLink: string;
  webContentLink: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  owners: Array<{
    displayName: string;
    emailAddress: string;
  }>;
  lastModifyingUser: {
    displayName: string;
    emailAddress: string;
  };
  parents: string[];
  shared: boolean;
  permissions: Array<{
    role: string;
    type: string;
    emailAddress?: string;
  }>;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{
      name: string;
      value: string;
    }>;
    body: {
      data: string;
    };
  };
  sizeEstimate: number;
  historyId: string;
  internalDate: string;
  labelIds: string[];
}

@Injectable()
export class GoogleWorkspaceIntegrationService {
  private readonly logger = new Logger(GoogleWorkspaceIntegrationService.name);
  private readonly googleApiBase = 'https://www.googleapis.com';

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
  ) {}

  async syncCalendarEvents(
    integrationId: string,
    calendarId = 'primary',
  ): Promise<GoogleCalendarEvent[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GOOGLE_WORKSPACE },
      });

      if (!integration) {
        throw new Error('Google Workspace integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Google access token not found');
      }

      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - 30); // Last 30 days
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + 30); // Next 30 days

      const response = await fetch(
        `${this.googleApiBase}/calendar/v3/calendars/${calendarId}/events?` +
          `timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Google Calendar API error: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const events = (data.items as Record<string, unknown>[]) || [];
      const syncedEvents: GoogleCalendarEvent[] = [];

      for (const event of events) {
        syncedEvents.push(event as unknown as GoogleCalendarEvent);
        await this.storeExternalData(
          integrationId,
          'calendar_event',
          event.id as string,
          {
            ...event,
            calendarId,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(`Synced ${syncedEvents.length} Google Calendar events`);
      return syncedEvents;
    } catch (error) {
      this.logger.error('Failed to sync Google Calendar events:', error);
      throw error;
    }
  }

  async syncDriveFiles(
    integrationId: string,
    folderId?: string,
  ): Promise<GoogleDriveFile[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GOOGLE_WORKSPACE },
      });

      if (!integration) {
        throw new Error('Google Workspace integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Google access token not found');
      }

      let query = 'trashed=false';
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const response = await fetch(
        `${this.googleApiBase}/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,description,webViewLink,webContentLink,size,createdTime,modifiedTime,owners,lastModifyingUser,parents,shared,permissions)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Google Drive API error: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const files = (data.files as Record<string, unknown>[]) || [];
      const syncedFiles: GoogleDriveFile[] = [];

      for (const file of files) {
        syncedFiles.push(file as unknown as GoogleDriveFile);
        await this.storeExternalData(
          integrationId,
          'drive_file',
          file.id as string,
          {
            ...file,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(`Synced ${syncedFiles.length} Google Drive files`);
      return syncedFiles;
    } catch (error) {
      this.logger.error('Failed to sync Google Drive files:', error);
      throw error;
    }
  }

  async syncGmailMessages(
    integrationId: string,
    query = 'is:unread',
  ): Promise<GmailMessage[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GOOGLE_WORKSPACE },
      });

      if (!integration) {
        throw new Error('Google Workspace integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Google access token not found');
      }

      // First, get message IDs
      const listResponse = await fetch(
        `${this.googleApiBase}/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!listResponse.ok) {
        throw new Error(`Gmail API error: ${listResponse.status}`);
      }

      const listData = (await listResponse.json()) as Record<string, unknown>;
      const messageIds = (
        (listData.messages as Record<string, unknown>[]) || []
      ).map((m: Record<string, unknown>) => m.id as string);
      const syncedMessages: GmailMessage[] = [];

      // Then, get full message details
      for (const messageId of messageIds) {
        try {
          const messageResponse = await fetch(
            `${this.googleApiBase}/gmail/v1/users/me/messages/${messageId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
            },
          );

          if (messageResponse.ok) {
            const message = (await messageResponse.json()) as GmailMessage;
            syncedMessages.push(message);
            await this.storeExternalData(
              integrationId,
              'gmail_message',
              message.id,
              {
                ...message,
                syncedAt: new Date(),
              },
            );
          }
        } catch (error) {
          this.logger.warn(`Failed to sync Gmail message ${messageId}:`, error);
        }
      }

      this.logger.log(`Synced ${syncedMessages.length} Gmail messages`);
      return syncedMessages;
    } catch (error) {
      this.logger.error('Failed to sync Gmail messages:', error);
      throw error;
    }
  }

  async createCalendarEvent(
    integrationId: string,
    eventData: Partial<GoogleCalendarEvent>,
  ): Promise<GoogleCalendarEvent> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GOOGLE_WORKSPACE },
      });

      if (!integration) {
        throw new Error('Google Workspace integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Google access token not found');
      }

      const response = await fetch(
        `${this.googleApiBase}/calendar/v3/calendars/primary/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventData),
        },
      );

      if (!response.ok) {
        throw new Error(`Google Calendar API error: ${response.status}`);
      }

      const createdEvent = (await response.json()) as Record<string, unknown>;
      this.logger.log(
        `Created Google Calendar event: ${createdEvent.id as string}`,
      );

      return createdEvent as unknown as GoogleCalendarEvent;
    } catch (error) {
      this.logger.error('Failed to create Google Calendar event:', error);
      throw error;
    }
  }

  async sendGmailNotification(
    integrationId: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GOOGLE_WORKSPACE },
      });

      if (!integration) {
        throw new Error('Google Workspace integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('Google access token not found');
      }

      const message = {
        raw: Buffer.from(
          `To: ${to}\r\n` +
            `Subject: ${subject}\r\n` +
            `Content-Type: text/html; charset=UTF-8\r\n` +
            `\r\n` +
            body,
        )
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, ''),
      };

      const response = await fetch(
        `${this.googleApiBase}/gmail/v1/users/me/messages/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        },
      );

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      this.logger.log(`Sent Gmail notification to ${to}`);
    } catch (error) {
      this.logger.error('Failed to send Gmail notification:', error);
      throw error;
    }
  }

  private async storeExternalData(
    integrationId: string,
    type: string,
    externalId: string,
    data: Record<string, unknown>,
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

      const mappedData = this.mapGoogleData(type, data);

      if (existing) {
        existing.rawData = data;
        existing.mappedData = mappedData;
        existing.lastSyncAt = new Date();
        await this.externalDataRepo.save(existing);
      } else {
        const externalData = this.externalDataRepo.create({
          integrationId,
          externalId,
          externalType: type,
          rawData: data,
          mappedData,
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

  private mapGoogleData(
    type: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (type) {
      case 'calendar_event':
        return {
          title: (data.summary as string) || 'Untitled Event',
          content: (data.description as string) || '',
          author:
            ((data.creator as Record<string, unknown>)
              ?.displayName as string) ||
            ((data.organizer as Record<string, unknown>)
              ?.displayName as string) ||
            'Unknown',
          source: 'google_workspace',
          url: (data.htmlLink as string) || '',
          metadata: {
            startTime: (data.start as Record<string, unknown>)
              ?.dateTime as string,
            endTime: (data.end as Record<string, unknown>)?.dateTime as string,
            location: data.location as string,
            attendees: (
              (data.attendees as Record<string, unknown>[]) || []
            ).map((a: Record<string, unknown>) => a.email as string),
            calendarId: data.calendarId as string,
          },
        };
      case 'drive_file':
        return {
          title: data.name as string,
          content: (data.description as string) || '',
          author:
            ((data.owners as Record<string, unknown>[])?.[0]
              ?.displayName as string) || 'Unknown',
          source: 'google_workspace',
          url: (data.webViewLink as string) || '',
          metadata: {
            mimeType: data.mimeType as string,
            size: data.size as string,
            shared: data.shared as boolean,
            lastModified: data.modifiedTime as string,
            permissions: (
              (data.permissions as Record<string, unknown>[]) || []
            ).map((p: Record<string, unknown>) => p.role as string),
          },
        };
      case 'gmail_message': {
        const headers =
          ((data.payload as Record<string, unknown>)?.headers as Record<
            string,
            unknown
          >[]) || [];
        const subject =
          (headers.find((h: Record<string, unknown>) => h.name === 'Subject')
            ?.value as string) || 'No Subject';
        const from =
          (headers.find((h: Record<string, unknown>) => h.name === 'From')
            ?.value as string) || 'Unknown Sender';

        return {
          title: subject,
          content: (data.snippet as string) || '',
          author: from,
          source: 'google_workspace',
          url: `https://mail.google.com/mail/u/0/#inbox/${data.id as string}`,
          metadata: {
            threadId: data.threadId as string,
            labels: (data.labelIds as string[]) || [],
            size: data.sizeEstimate as number,
            date: new Date(parseInt(data.internalDate as string)).toISOString(),
          },
        };
      }
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
