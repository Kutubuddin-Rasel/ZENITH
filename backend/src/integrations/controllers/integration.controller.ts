import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  RawBodyRequest,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  IntegrationService,
  CreateIntegrationDto,
  UpdateIntegrationDto,
} from '../services/integration.service';
import {
  SlackIntegrationService,
  SlackCommand,
} from '../services/slack-integration.service';
import {
  GitHubIntegrationService,
  GitHubWebhookPayload,
} from '../services/github-integration.service';
import {
  JiraIntegrationService,
  JiraWebhookPayload,
} from '../services/jira-integration.service';
import { GoogleWorkspaceIntegrationService } from '../services/google-workspace-integration.service';
import {
  MicrosoftTeamsIntegrationService,
  TeamsNotification,
} from '../services/microsoft-teams-integration.service';
import {
  TrelloIntegrationService,
  TrelloWebhookPayload,
} from '../services/trello-integration.service';
import {
  UniversalSearchService,
  SearchQuery,
} from '../services/universal-search.service';
import { WebhookVerificationService } from '../services/webhook-verification.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IntegrationType } from '../entities/integration.entity';
import { IntegrationOwnershipGuard } from '../guards/integration-ownership.guard';
import {
  SyncSlackChannelsDto,
  SyncSlackUsersDto,
  SyncSlackMessagesDto,
  SendSlackNotificationDto,
} from '../dto/sync.dto';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    organizationId?: string;
    email: string;
  };
}

/**
 * Helper to enforce organization context for multi-tenant security.
 * Throws BadRequestException if organizationId is missing.
 */
function getRequiredOrganizationId(req: AuthenticatedRequest): string {
  if (!req.user.organizationId) {
    throw new BadRequestException(
      'Organization context required. Please re-authenticate.',
    );
  }
  return req.user.organizationId;
}

// interface SlackWebhookBody {
//   token: string;
//   team_id: string;
//   api_app_id: string;
//   event: Record<string, unknown>;
//   type: string;
//   event_id: string;
//   event_time: number;
//   authed_users: string[];
// }

interface JiraIssueData {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: {
    name: string;
    statusCategory: {
      name: string;
    };
  };
  priority: {
    name: string;
  };
  issueType: {
    name: string;
    iconUrl: string;
  };
  assignee: {
    displayName: string;
    emailAddress: string;
    avatarUrls: {
      '48x48': string;
    };
  } | null;
  reporter: {
    displayName: string;
    emailAddress: string;
    avatarUrls: {
      '48x48': string;
    };
  };
  created: string;
  updated: string;
  resolution: {
    name: string;
  } | null;
  labels: string[];
  components: Array<{
    name: string;
  }>;
  fixVersions: Array<{
    name: string;
  }>;
  project: {
    key: string;
    name: string;
  };
  customFields: Record<string, unknown>;
}

interface LocalIssueData {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee?: string;
  labels?: string[];
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

interface GoogleEventData {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName: string;
    responseStatus: string;
  }>;
}

interface TeamsMeetingData {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
}

interface TrelloCardData {
  name: string;
  desc?: string;
  due?: string;
  idMembers?: string[];
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

interface SearchContentItem {
  id: string;
  title: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  [key: string]: unknown; // Index signature for compatibility
}

@Controller('api/integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationController {
  constructor(
    private readonly integrationService: IntegrationService,
    private readonly webhookVerificationService: WebhookVerificationService,
    private readonly slackIntegrationService: SlackIntegrationService,
    private readonly githubIntegrationService: GitHubIntegrationService,
    private readonly jiraIntegrationService: JiraIntegrationService,
    private readonly googleWorkspaceIntegrationService: GoogleWorkspaceIntegrationService,
    private readonly microsoftTeamsIntegrationService: MicrosoftTeamsIntegrationService,
    private readonly trelloIntegrationService: TrelloIntegrationService,
    private readonly universalSearchService: UniversalSearchService,
  ) {}

  @Post()
  @UseGuards(SuperAdminGuard)
  async createIntegration(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateIntegrationDto,
  ) {
    // const userId = req.user.id;
    const organizationId = getRequiredOrganizationId(req);

    return await this.integrationService.createIntegration({
      ...dto,
      organizationId,
    });
  }

  @Get()
  async getIntegrations(@Request() req: AuthenticatedRequest) {
    const organizationId = getRequiredOrganizationId(req);
    return await this.integrationService.getIntegrations(organizationId);
  }

  @Get(':id')
  async getIntegration(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    return await this.integrationService.getIntegration(id, organizationId);
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  async updateIntegration(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateIntegrationDto,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    return await this.integrationService.updateIntegration(
      id,
      organizationId,
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SuperAdminGuard)
  async deleteIntegration(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    await this.integrationService.deleteIntegration(id, organizationId);
  }

  @Post(':id/sync')
  @UseGuards(SuperAdminGuard)
  async syncIntegration(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    return await this.integrationService.syncIntegration(id, organizationId);
  }

  @Get(':id/health')
  async getIntegrationHealth(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    return await this.integrationService.getIntegrationHealth(
      id,
      organizationId,
    );
  }

  @Post(':id/test')
  @UseGuards(SuperAdminGuard)
  async testIntegration(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    const isConnected = await this.integrationService.testIntegration(
      id,
      organizationId,
    );
    return { connected: isConnected };
  }

  @Get(':id/logs')
  async getSyncLogs(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    const organizationId = getRequiredOrganizationId(req);
    return await this.integrationService.getSyncLogs(id, organizationId, limit);
  }

  // Slack-specific endpoints
  // OAuth flow is now handled by OAuthController
  // See: /api/integrations/oauth/slack/authorize

  @Post('slack/webhook')
  async handleSlackWebhook(
    @Body() body: unknown,
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Get raw body for signature verification
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body);

    // Find all Slack integrations and verify which one matches the signature
    const slackIntegrations =
      await this.integrationService.findIntegrationsByTypeForWebhook(
        IntegrationType.SLACK,
      );

    let matchingIntegration: (typeof slackIntegrations)[number] | null = null;
    for (const integration of slackIntegrations) {
      if (!integration.authConfig?.webhookSecret) continue;

      const isValid = this.webhookVerificationService.verifySlackSignature(
        rawBody,
        timestamp,
        signature,
        integration.authConfig.webhookSecret,
      );

      if (isValid) {
        matchingIntegration = integration;
        break;
      }
    }

    if (!matchingIntegration) {
      throw new BadRequestException(
        'No Slack integration found with matching webhook secret',
      );
    }

    // Handle Slack webhook events
    return { received: true };
  }

  @Post('slack/command')
  async handleSlackCommand(@Body() command: SlackCommand) {
    return (await this.slackIntegrationService.handleSlashCommand(
      command,
    )) as Record<string, unknown>;
  }

  @Post('slack/notify')
  @UseGuards(IntegrationOwnershipGuard)
  async sendSlackNotification(@Body() dto: SendSlackNotificationDto) {
    return await this.slackIntegrationService.sendNotification(
      dto.integrationId,
      dto.message,
    );
  }

  @Post('slack/sync-channels')
  @UseGuards(IntegrationOwnershipGuard)
  async syncSlackChannels(@Body() dto: SyncSlackChannelsDto) {
    return await this.slackIntegrationService.syncChannels(dto.integrationId);
  }

  @Post('slack/sync-users')
  @UseGuards(IntegrationOwnershipGuard)
  async syncSlackUsers(@Body() dto: SyncSlackUsersDto) {
    return await this.slackIntegrationService.syncUsers(dto.integrationId);
  }

  @Post('slack/sync-messages')
  @UseGuards(IntegrationOwnershipGuard)
  async syncSlackMessages(@Body() dto: SyncSlackMessagesDto) {
    return (await this.slackIntegrationService.syncMessages(
      dto.integrationId,
      dto.channelId,
      dto.limit,
    )) as unknown as Record<string, unknown>[];
  }

  // GitHub-specific endpoints
  @Post('github/webhook')
  async handleGitHubWebhook(
    @Body() payload: GitHubWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Get raw body for signature verification
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(payload);

    // Find all GitHub integrations and verify which one matches the signature
    const githubIntegrations =
      await this.integrationService.findIntegrationsByTypeForWebhook(
        IntegrationType.GITHUB,
      );

    let matchingIntegration: (typeof githubIntegrations)[number] | null = null;
    for (const integration of githubIntegrations) {
      if (!integration.authConfig?.webhookSecret) continue;

      const isValid = this.webhookVerificationService.verifyGitHubSignature(
        rawBody,
        signature,
        integration.authConfig.webhookSecret,
      );

      if (isValid) {
        matchingIntegration = integration;
        break;
      }
    }

    if (!matchingIntegration) {
      throw new BadRequestException(
        'No GitHub integration found with matching webhook secret',
      );
    }

    // Process webhook
    await this.githubIntegrationService.handleWebhook(payload);
    return { received: true };
  }

  @Post('github/sync-repositories')
  async syncGitHubRepositories(@Body() body: { integrationId: string }) {
    return await this.githubIntegrationService.syncRepositories(
      body.integrationId,
    );
  }

  @Post('github/sync-issues')
  async syncGitHubIssues(
    @Body() body: { integrationId: string; repository: string },
  ) {
    return await this.githubIntegrationService.syncIssues(
      body.integrationId,
      body.repository,
    );
  }

  @Post('github/sync-pull-requests')
  async syncGitHubPullRequests(
    @Body() body: { integrationId: string; repository: string },
  ) {
    return await this.githubIntegrationService.syncPullRequests(
      body.integrationId,
      body.repository,
    );
  }

  @Post('github/sync-commits')
  async syncGitHubCommits(
    @Body()
    body: {
      integrationId: string;
      repository: string;
      branch?: string;
    },
  ) {
    return await this.githubIntegrationService.syncCommits(
      body.integrationId,
      body.repository,
      body.branch,
    );
  }

  // Jira-specific endpoints
  @Post('jira/webhook')
  async handleJiraWebhook(
    @Body() payload: JiraWebhookPayload,
    @Query('secret') webhookSecret: string,
  ) {
    // Find all Jira integrations and verify which one matches the secret
    const jiraIntegrations =
      await this.integrationService.findIntegrationsByTypeForWebhook(
        IntegrationType.JIRA,
      );

    let matchingIntegration: (typeof jiraIntegrations)[number] | null = null;
    for (const integration of jiraIntegrations) {
      if (!integration.authConfig?.webhookSecret) continue;

      const isValid = this.webhookVerificationService.verifyJiraWebhook(
        webhookSecret,
        integration.authConfig.webhookSecret,
      );

      if (isValid) {
        matchingIntegration = integration;
        break;
      }
    }

    if (!matchingIntegration) {
      throw new BadRequestException(
        'No Jira integration found with matching webhook secret',
      );
    }

    // Process webhook
    await this.jiraIntegrationService.handleWebhook(payload);
    return { received: true };
  }

  @Post('jira/sync-projects')
  async syncJiraProjects(@Body() body: { integrationId: string }) {
    return await this.jiraIntegrationService.syncProjects(body.integrationId);
  }

  @Post('jira/sync-issues')
  async syncJiraIssues(
    @Body() body: { integrationId: string; projectKey: string },
  ) {
    return await this.jiraIntegrationService.syncIssues(
      body.integrationId,
      body.projectKey,
    );
  }

  @Post('jira/import-issue')
  async importJiraIssue(
    @Body()
    body: {
      integrationId: string;
      jiraIssue: JiraIssueData;
      targetProjectId: string;
    },
  ) {
    return (await this.jiraIntegrationService.importIssue(
      body.integrationId,
      body.jiraIssue,
      body.targetProjectId,
    )) as Record<string, unknown>;
  }

  @Post('jira/export-issue')
  async exportJiraIssue(
    @Body()
    body: {
      integrationId: string;
      localIssue: LocalIssueData;
      jiraProjectKey: string;
    },
  ) {
    return await this.jiraIntegrationService.exportIssue(
      body.integrationId,
      body.localIssue,
      body.jiraProjectKey,
    );
  }

  @Post('jira/sync-status')
  async syncJiraIssueStatus(
    @Body()
    body: {
      integrationId: string;
      jiraIssueKey: string;
      newStatus: string;
    },
  ) {
    return await this.jiraIntegrationService.syncIssueStatus(
      body.integrationId,
      body.jiraIssueKey,
      body.newStatus,
    );
  }

  // Google Workspace-specific endpoints
  @Post('google/sync-calendar')
  async syncGoogleCalendar(
    @Body() body: { integrationId: string; calendarId?: string },
  ) {
    return await this.googleWorkspaceIntegrationService.syncCalendarEvents(
      body.integrationId,
      body.calendarId,
    );
  }

  @Post('google/sync-drive')
  async syncGoogleDrive(
    @Body() body: { integrationId: string; folderId?: string },
  ) {
    return await this.googleWorkspaceIntegrationService.syncDriveFiles(
      body.integrationId,
      body.folderId,
    );
  }

  @Post('google/sync-gmail')
  async syncGmail(@Body() body: { integrationId: string; query?: string }) {
    return await this.googleWorkspaceIntegrationService.syncGmailMessages(
      body.integrationId,
      body.query,
    );
  }

  @Post('google/create-event')
  async createGoogleEvent(
    @Body() body: { integrationId: string; eventData: GoogleEventData },
  ) {
    return await this.googleWorkspaceIntegrationService.createCalendarEvent(
      body.integrationId,
      body.eventData,
    );
  }

  @Post('google/send-notification')
  async sendGmailNotification(
    @Body()
    body: {
      integrationId: string;
      to: string;
      subject: string;
      body: string;
    },
  ) {
    return await this.googleWorkspaceIntegrationService.sendGmailNotification(
      body.integrationId,
      body.to,
      body.subject,
      body.body,
    );
  }

  // Microsoft Teams-specific endpoints
  @Post('teams/sync-channels')
  async syncTeamsChannels(
    @Body() body: { integrationId: string; teamId: string },
  ) {
    return await this.microsoftTeamsIntegrationService.syncChannels(
      body.integrationId,
      body.teamId,
    );
  }

  @Post('teams/sync-messages')
  async syncTeamsMessages(
    @Body() body: { integrationId: string; teamId: string; channelId: string },
  ) {
    return await this.microsoftTeamsIntegrationService.syncMessages(
      body.integrationId,
      body.teamId,
      body.channelId,
    );
  }

  @Post('teams/sync-meetings')
  async syncTeamsMeetings(
    @Body() body: { integrationId: string; userId: string },
  ) {
    return await this.microsoftTeamsIntegrationService.syncMeetings(
      body.integrationId,
      body.userId,
    );
  }

  @Post('teams/send-notification')
  async sendTeamsNotification(
    @Body() body: { integrationId: string; notification: TeamsNotification },
  ) {
    return await this.microsoftTeamsIntegrationService.sendNotification(
      body.integrationId,
      body.notification,
    );
  }

  @Post('teams/create-meeting')
  async createTeamsMeeting(
    @Body() body: { integrationId: string; meetingData: TeamsMeetingData },
  ) {
    return await this.microsoftTeamsIntegrationService.createMeeting(
      body.integrationId,
      body.meetingData,
    );
  }

  // Trello-specific endpoints
  @Post('trello/webhook')
  async handleTrelloWebhook(
    @Body() payload: TrelloWebhookPayload,
    @Headers('x-trello-webhook') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Get raw body for signature verification
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(payload);

    // Find all Trello integrations and verify which one matches the signature
    const trelloIntegrations =
      await this.integrationService.findIntegrationsByTypeForWebhook(
        IntegrationType.TRELLO,
      );

    let matchingIntegration: (typeof trelloIntegrations)[number] | null = null;
    for (const integration of trelloIntegrations) {
      if (!integration.authConfig?.webhookSecret) continue;

      const callbackUrl = integration.config.webhookUrl || '';
      const isValid = this.webhookVerificationService.verifyTrelloSignature(
        rawBody,
        callbackUrl,
        signature,
        integration.authConfig.webhookSecret,
      );

      if (isValid) {
        matchingIntegration = integration;
        break;
      }
    }

    if (!matchingIntegration) {
      throw new BadRequestException(
        'No Trello integration found with matching webhook secret',
      );
    }

    // Process webhook
    await this.trelloIntegrationService.handleWebhook(payload);
    return { received: true };
  }

  @Post('trello/sync-boards')
  async syncTrelloBoards(@Body() body: { integrationId: string }) {
    return await this.trelloIntegrationService.syncBoards(body.integrationId);
  }

  @Post('trello/sync-cards')
  async syncTrelloCards(
    @Body() body: { integrationId: string; boardId: string },
  ) {
    return await this.trelloIntegrationService.syncCards(
      body.integrationId,
      body.boardId,
    );
  }

  @Post('trello/sync-lists')
  async syncTrelloLists(
    @Body() body: { integrationId: string; boardId: string },
  ) {
    return await this.trelloIntegrationService.syncLists(
      body.integrationId,
      body.boardId,
    );
  }

  @Post('trello/create-card')
  async createTrelloCard(
    @Body()
    body: {
      integrationId: string;
      listId: string;
      cardData: TrelloCardData;
    },
  ) {
    return await this.trelloIntegrationService.createCard(
      body.integrationId,
      body.listId,
      body.cardData,
    );
  }

  @Post('trello/update-card-status')
  async updateTrelloCardStatus(
    @Body() body: { integrationId: string; cardId: string; listId: string },
  ) {
    return await this.trelloIntegrationService.updateCardStatus(
      body.integrationId,
      body.cardId,
      body.listId,
    );
  }

  // Universal search endpoints
  @Get('search/universal')
  async universalSearch(@Query() query: SearchQuery) {
    return await this.universalSearchService.search(query);
  }

  @Get('search/suggestions')
  async getSearchSuggestions(@Query('q') query: string) {
    return await this.universalSearchService.getSearchSuggestions(query);
  }

  @Get('search/popular')
  async getPopularSearches(@Query('limit') limit?: number) {
    return await this.universalSearchService.getPopularSearches(limit);
  }

  @Get('search/analytics')
  async getSearchAnalytics(@Query('days') days?: number) {
    return (await this.universalSearchService.getSearchAnalytics(
      days,
    )) as Record<string, unknown>;
  }

  @Post('search/index')
  async indexContent(
    @Body() body: { integrationId: string; content: SearchContentItem[] },
  ) {
    await this.universalSearchService.indexExternalContent(
      body.integrationId,
      body.content,
    );
    return { indexed: true };
  }
}
