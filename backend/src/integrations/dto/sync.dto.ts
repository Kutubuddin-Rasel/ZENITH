import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
  ValidateNested,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Base DTO for integration operations requiring integration ID.
 */
export class IntegrationIdDto {
  @IsUUID('4', { message: 'integrationId must be a valid UUID' })
  @IsNotEmpty()
  integrationId: string;
}

/**
 * DTO for syncing Slack channels.
 */
export class SyncSlackChannelsDto extends IntegrationIdDto {}

/**
 * DTO for syncing Slack users.
 */
export class SyncSlackUsersDto extends IntegrationIdDto {}

/**
 * DTO for syncing Slack messages from a channel.
 */
export class SyncSlackMessagesDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'channelId is required' })
  channelId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000, { message: 'limit cannot exceed 1000 messages' })
  limit?: number;
}

/**
 * DTO for Slack notification message.
 */
export class SlackNotificationMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'channel is required' })
  channel: string;

  @IsString()
  @IsNotEmpty({ message: 'text is required' })
  text: string;

  @IsOptional()
  @IsArray()
  blocks?: unknown[];

  @IsOptional()
  @IsArray()
  attachments?: unknown[];

  @IsOptional()
  @IsString()
  thread_ts?: string;
}

/**
 * DTO for sending Slack notification.
 */
export class SendSlackNotificationDto extends IntegrationIdDto {
  @ValidateNested()
  @Type(() => SlackNotificationMessageDto)
  message: SlackNotificationMessageDto;
}

/**
 * DTO for syncing GitHub repositories.
 */
export class SyncGitHubReposDto extends IntegrationIdDto {}

/**
 * DTO for syncing GitHub issues from a repository.
 */
export class SyncGitHubIssuesDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'repository is required (owner/repo format)' })
  repository: string;
}

/**
 * DTO for syncing GitHub pull requests.
 */
export class SyncGitHubPullRequestsDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'repository is required (owner/repo format)' })
  repository: string;
}

/**
 * DTO for syncing GitHub commits.
 */
export class SyncGitHubCommitsDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'repository is required (owner/repo format)' })
  repository: string;

  @IsOptional()
  @IsString()
  branch?: string;
}

/**
 * DTO for syncing Jira projects.
 */
export class SyncJiraProjectsDto extends IntegrationIdDto {}

/**
 * DTO for syncing Jira issues from a project.
 */
export class SyncJiraIssuesDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'projectKey is required' })
  projectKey: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  startAt?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100, { message: 'maxResults cannot exceed 100' })
  maxResults?: number;
}

/**
 * DTO for importing Jira project to Zenith.
 */
export class ImportJiraProjectDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'projectKey is required' })
  projectKey: string;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;

  @IsOptional()
  @IsBoolean()
  includeComments?: boolean;
}

/**
 * DTO for syncing Trello boards.
 */
export class SyncTrelloBoardsDto extends IntegrationIdDto {}

/**
 * DTO for syncing Trello cards from a board.
 */
export class SyncTrelloCardsDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'boardId is required' })
  boardId: string;
}

/**
 * DTO for syncing Google Calendar events.
 */
export class SyncGoogleCalendarDto extends IntegrationIdDto {
  @IsOptional()
  @IsString()
  calendarId?: string;
}

/**
 * DTO for syncing Google Drive files.
 */
export class SyncGoogleDriveDto extends IntegrationIdDto {
  @IsOptional()
  @IsString()
  folderId?: string;
}

/**
 * DTO for syncing Microsoft Teams channels.
 */
export class SyncTeamsChannelsDto extends IntegrationIdDto {
  @IsString()
  @IsNotEmpty({ message: 'teamId is required' })
  teamId: string;
}

/**
 * DTO for universal search across integrations.
 */
export class UniversalSearchDto {
  @IsString()
  @IsNotEmpty({ message: 'query is required' })
  query: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  integrationTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
