import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  Min,
  IsNotEmpty,
} from 'class-validator';

/**
 * DTO for sync operations that require only integration ID.
 */
export class IntegrationIdDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;
}

/**
 * DTO for GitHub repository sync.
 */
export class SyncRepositoryDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;

  @IsString()
  @IsNotEmpty()
  repository: string;
}

/**
 * DTO for GitHub commits sync.
 */
export class SyncCommitsDto extends SyncRepositoryDto {
  @IsString()
  @IsOptional()
  branch?: string;
}

/**
 * DTO for Slack channel sync.
 */
export class SyncSlackMessagesDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;

  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  limit?: number;
}

/**
 * DTO for Slack notification.
 */
export class SlackNotificationDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;

  @IsObject()
  message: {
    channel: string;
    text: string;
    blocks?: unknown[];
  };
}

/**
 * DTO for Jira project sync.
 */
export class SyncJiraIssuesDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;

  @IsString()
  @IsNotEmpty()
  projectKey: string;
}

/**
 * DTO for Teams channel sync.
 */
export class SyncTeamsChannelsDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;
}

/**
 * DTO for Teams messages sync.
 */
export class SyncTeamsMessagesDto extends SyncTeamsChannelsDto {
  @IsString()
  @IsNotEmpty()
  channelId: string;
}

/**
 * DTO for Trello board sync.
 */
export class SyncTrelloBoardDto {
  @IsString()
  @IsNotEmpty()
  integrationId: string;

  @IsString()
  @IsNotEmpty()
  boardId: string;
}

/**
 * DTO for universal search query.
 */
export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  sources?: string[];

  @IsString()
  @IsOptional()
  contentType?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  limit?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  offset?: number;
}
