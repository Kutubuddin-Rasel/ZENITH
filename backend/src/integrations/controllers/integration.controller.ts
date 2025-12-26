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
  Res,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  IntegrationService,
  CreateIntegrationDto,
  UpdateIntegrationDto,
} from '../services/integration.service';
import {
  SlackIntegrationService,
  SlackCommand,
  SlackInteractivePayload,
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
import { ConfigService } from '@nestjs/config';
import { GitHubAppService } from '../services/github-app.service';
import { Logger } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';

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
  private readonly logger = new Logger(IntegrationController.name);

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
    private readonly githubAppService: GitHubAppService,
    private readonly configService: ConfigService,
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

  /**
   * Handle Slack interactive events (modal submissions, button clicks, etc.)
   * Slack sends these as form-encoded payload string in a 'payload' field.
   */
  @Post('slack/interactivity')
  async handleSlackInteractivity(
    @Body() body: { payload: string },
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Get raw body for signature verification
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : `payload=${encodeURIComponent(body.payload)}`;

    // Find Slack integrations and verify signature
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
        'No Slack integration found with matching webhook signature',
      );
    }

    // Parse the payload
    const payload = JSON.parse(body.payload) as SlackInteractivePayload;

    // Handle different interaction types
    if (payload.type === 'view_submission') {
      return await this.slackIntegrationService.handleViewSubmission(payload);
    }

    // For other interaction types (block_actions, shortcuts), return acknowledgment
    return { ok: true };
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

  /**
   * List user's accessible GitHub repositories.
   * Used to populate dropdown in project integration settings.
   * Supports both GitHub App (installation tokens) and legacy OAuth integrations.
   */
  @Get('github/repos')
  async listGitHubRepositories(@Request() req: AuthenticatedRequest) {
    const organizationId = getRequiredOrganizationId(req);

    // Find the GitHub integration for this organization
    const integrations =
      await this.integrationService.getIntegrations(organizationId);

    // Debug logging
    this.logger.debug(
      `Found ${integrations.length} total integrations for org ${organizationId}`,
    );
    const githubIntegrations = integrations.filter(
      (i) => i.type === IntegrationType.GITHUB,
    );
    this.logger.debug(`Found ${githubIntegrations.length} GitHub integrations`);
    githubIntegrations.forEach((gi, idx) => {
      this.logger.debug(
        `  [${idx}] id=${gi.id}, isActive=${gi.isActive}, installationId=${gi.installationId}, isLegacyOAuth=${gi.isLegacyOAuth}`,
      );
    });

    const githubIntegration = integrations.find(
      (i) => i.type === IntegrationType.GITHUB && i.isActive,
    );

    if (!githubIntegration) {
      // Check if there's a disabled integration that can be re-enabled
      const disabledIntegration = integrations.find(
        (i) =>
          i.type === IntegrationType.GITHUB && !i.isActive && i.installationId,
      );

      this.logger.debug(
        'No active GitHub integration found - returning connected=false',
      );
      return {
        connected: false,
        repositories: [],
        hasDisabledIntegration: !!disabledIntegration,
        disabledIntegrationId: disabledIntegration?.id,
      };
    }

    this.logger.debug(`Using GitHub integration: ${githubIntegration.id}`);

    // Check if this is a GitHub App integration (has installationId, not legacy OAuth)
    if (githubIntegration.installationId && !githubIntegration.isLegacyOAuth) {
      try {
        // Use GitHub App's installation token to list repos
        const repos = await this.githubAppService.listInstallationRepositories(
          githubIntegration.installationId,
        );
        return {
          connected: true,
          integrationId: githubIntegration.id,
          isGitHubApp: true,
          repositories: repos,
        };
      } catch (error) {
        this.logger.error('Failed to list GitHub App repos:', error);
        // Still return connected=true since the integration exists
        return {
          connected: true,
          integrationId: githubIntegration.id,
          isGitHubApp: true,
          repositories:
            githubIntegration.config?.repositories?.map((r: string) => ({
              full_name: r,
              name: r.split('/').pop() || r,
              private: false,
              description: null,
            })) || [],
          error: 'Failed to fetch latest repos from GitHub',
        };
      }
    }

    // Legacy OAuth flow
    try {
      const repos = await this.githubIntegrationService.listUserRepositories(
        githubIntegration.id,
      );
      return {
        connected: true,
        integrationId: githubIntegration.id,
        isGitHubApp: false,
        repositories: repos,
      };
    } catch (error) {
      this.logger.error('Failed to list OAuth repos:', error);
      return {
        connected: true,
        integrationId: githubIntegration.id,
        isGitHubApp: false,
        repositories: [],
        error: 'Failed to fetch repos from GitHub',
      };
    }
  }

  /**
   * Disable the GitHub integration (soft disconnect).
   * Sets isActive=false but keeps the record for easy re-enablement.
   */
  @Post('github/disable')
  async disableGitHub(@Request() req: AuthenticatedRequest) {
    const organizationId = getRequiredOrganizationId(req);

    // Find the active GitHub integration
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const githubIntegration = integrations.find(
      (i) => i.type === IntegrationType.GITHUB && i.isActive,
    );

    if (!githubIntegration) {
      throw new NotFoundException('No active GitHub integration found');
    }

    this.logger.log(
      `Disabling GitHub integration ${githubIntegration.id} for org ${organizationId}`,
    );

    // Soft disable - just set isActive to false
    await this.integrationService.updateIntegration(
      githubIntegration.id,
      organizationId,
      {
        isActive: false,
      },
    );

    this.logger.log(
      `GitHub integration ${githubIntegration.id} disabled successfully`,
    );

    return {
      success: true,
      message: 'GitHub integration disabled. You can re-enable it anytime.',
      integrationId: githubIntegration.id,
    };
  }

  /**
   * Enable a previously disabled GitHub integration.
   * Reactivates an existing integration without requiring reinstallation.
   */
  @Post('github/enable')
  async enableGitHub(@Request() req: AuthenticatedRequest) {
    const organizationId = getRequiredOrganizationId(req);

    // Find a disabled GitHub integration
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const disabledIntegration = integrations.find(
      (i) =>
        i.type === IntegrationType.GITHUB && !i.isActive && i.installationId,
    );

    if (!disabledIntegration) {
      throw new NotFoundException('No disabled GitHub integration found');
    }

    this.logger.log(
      `Enabling GitHub integration ${disabledIntegration.id} for org ${organizationId}`,
    );

    // Verify the GitHub installation still exists
    try {
      await this.githubAppService.getInstallationToken(
        disabledIntegration.installationId!,
      );
      this.logger.log(
        `GitHub installation ${disabledIntegration.installationId} verified`,
      );
    } catch (error) {
      this.logger.error(
        `GitHub installation ${disabledIntegration.installationId} no longer valid:`,
        error,
      );
      throw new BadRequestException(
        'The GitHub App was uninstalled from GitHub. Please connect again to reinstall.',
      );
    }

    // Re-enable the integration
    await this.integrationService.updateIntegration(
      disabledIntegration.id,
      organizationId,
      {
        isActive: true,
      },
    );

    this.logger.log(
      `GitHub integration ${disabledIntegration.id} enabled successfully`,
    );

    return {
      success: true,
      message: 'GitHub integration re-enabled successfully',
      integrationId: disabledIntegration.id,
    };
  }

  /**
   * Remove the GitHub integration completely.
   * This calls the GitHub API to uninstall the app and marks the integration as removed.
   */
  @Delete('github/remove')
  async removeGitHub(@Request() req: AuthenticatedRequest) {
    const organizationId = getRequiredOrganizationId(req);

    // Find any GitHub integration (active or disabled)
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const githubIntegration = integrations.find(
      (i) => i.type === IntegrationType.GITHUB && i.installationId,
    );

    if (!githubIntegration) {
      throw new NotFoundException('No GitHub integration found');
    }

    this.logger.log(
      `Removing GitHub integration ${githubIntegration.id} for org ${organizationId}`,
    );
    this.logger.log(
      `Uninstalling GitHub App installation ${githubIntegration.installationId}`,
    );

    // Call GitHub API to delete the installation
    try {
      await this.githubAppService.deleteInstallation(
        githubIntegration.installationId!,
      );
      this.logger.log(
        `GitHub installation ${githubIntegration.installationId} deleted from GitHub`,
      );
    } catch (error) {
      this.logger.error(`Failed to delete GitHub installation:`, error);
      // Continue anyway - user might have already uninstalled from GitHub
    }

    // Mark as inactive (the GitHub installation is now deleted)
    await this.integrationService.updateIntegration(
      githubIntegration.id,
      organizationId,
      {
        isActive: false,
      },
    );

    this.logger.log(
      `GitHub integration ${githubIntegration.id} removed successfully`,
    );

    return {
      success: true,
      message: 'GitHub integration fully removed',
      integrationId: githubIntegration.id,
    };
  }
  /**
   * Get the current GitHub repository linked to a project.
   */
  @Get('projects/:projectId/github/link')
  async getProjectGitHubLink(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);

    // Find the GitHub integration for this organization
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const githubIntegration = integrations.find(
      (i) => i.type === IntegrationType.GITHUB && i.isActive,
    );

    if (!githubIntegration) {
      return { connected: false, link: null };
    }

    const link = await this.githubIntegrationService.getProjectRepositoryLink(
      githubIntegration.id,
      projectId,
    );

    return {
      connected: true,
      integrationId: githubIntegration.id,
      link,
    };
  }

  /**
   * Link a GitHub repository to a project.
   * Requires project ownership (Project Lead or Super-Admin).
   */
  @Post('projects/:projectId/github/link')
  async linkProjectToGitHubRepository(
    @Param('projectId') projectId: string,
    @Body() body: { repositoryFullName: string; projectKey: string },
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);

    // Find the GitHub integration for this organization
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const githubIntegration = integrations.find(
      (i) => i.type === IntegrationType.GITHUB && i.isActive,
    );

    if (!githubIntegration) {
      throw new BadRequestException('GitHub integration not connected');
    }

    // Register the link
    await this.githubIntegrationService.registerRepositoryProjectLink(
      githubIntegration.id,
      body.repositoryFullName,
      projectId,
      body.projectKey,
    );

    return {
      success: true,
      link: {
        repositoryFullName: body.repositoryFullName,
        projectKey: body.projectKey,
        linkedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Unlink a GitHub repository from a project.
   */
  @Delete('projects/:projectId/github/link')
  async unlinkProjectFromGitHubRepository(
    @Param('projectId') projectId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const organizationId = getRequiredOrganizationId(req);

    // Find the GitHub integration for this organization
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const githubIntegration = integrations.find(
      (i) => i.type === IntegrationType.GITHUB && i.isActive,
    );

    if (!githubIntegration) {
      throw new BadRequestException('GitHub integration not connected');
    }

    const unlinked =
      await this.githubIntegrationService.unlinkProjectFromRepository(
        githubIntegration.id,
        projectId,
      );

    return { success: unlinked };
  }

  // ========================================
  // GitHub App Endpoints (Enterprise)
  // ========================================

  /**
   * Webhook handler for GitHub App events.
   * Handles installation and repository change events.
   * @Public() - No auth required, requests come from GitHub
   */
  @Public()
  @Post('github-app/webhook')
  @HttpCode(HttpStatus.OK)
  async handleGitHubAppWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-delivery') deliveryId: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.logger.log('='.repeat(60));
    this.logger.log('🔔 GITHUB APP WEBHOOK RECEIVED');
    this.logger.log('='.repeat(60));
    this.logger.log(`Event Type: ${event || 'MISSING'}`);
    this.logger.log(`Delivery ID: ${deliveryId || 'MISSING'}`);
    this.logger.log(`Signature Present: ${signature ? 'YES' : 'NO'}`);
    this.logger.log(`Payload Keys: ${Object.keys(payload).join(', ')}`);

    const rawBody = req.rawBody;
    this.logger.log(`Raw Body Present: ${rawBody ? 'YES' : 'NO'}`);
    this.logger.log(`Raw Body Size: ${rawBody ? rawBody.length : 0} bytes`);

    if (!rawBody) {
      this.logger.error(
        '❌ No raw body - webhook signature verification will fail',
      );
      throw new BadRequestException(
        'Raw body required for webhook verification',
      );
    }

    // Verify signature
    const webhookSecret = this.githubAppService.getWebhookSecret();
    this.logger.log(
      `Webhook Secret Configured: ${webhookSecret ? 'YES' : 'NO'}`,
    );

    if (signature && webhookSecret) {
      const isValid = this.githubAppService.verifyWebhookSignature(
        rawBody,
        signature,
      );
      this.logger.log(
        `Signature Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`,
      );
      if (!isValid) {
        throw new BadRequestException('Invalid webhook signature');
      }
    } else {
      this.logger.warn(
        '⚠️ Skipping signature verification (secret or signature missing)',
      );
    }

    this.logger.log(`Processing event: ${event}`);

    switch (event) {
      case 'installation': {
        this.logger.log('📦 Processing INSTALLATION event');

        // Type the full payload from GitHub
        const installationPayload = payload as unknown as {
          action:
            | 'created'
            | 'deleted'
            | 'suspend'
            | 'unsuspend'
            | 'new_permissions_accepted';
          installation: {
            id: number;
            account: {
              login: string;
              id: number;
              type: 'User' | 'Organization';
            };
            repository_selection: 'all' | 'selected';
            permissions: Record<string, string>;
            events: string[];
          };
          repositories?: Array<{
            id: number;
            name: string;
            full_name: string;
            private: boolean;
          }>;
          sender: {
            login: string;
            id: number;
          };
        };

        const { action, installation, repositories } = installationPayload;

        this.logger.log(`Action: ${action}`);
        this.logger.log(`Installation ID: ${installation.id}`);
        this.logger.log(`Account: ${installation.account.login}`);
        this.logger.log(`Account Type: ${installation.account.type}`);
        this.logger.log(`Repositories: ${repositories?.length || 0}`);

        // Handle different installation actions
        try {
          switch (action) {
            case 'created': {
              // Find or create integration for this installation
              // Note: We need to find the org that initiated this installation
              // For now, we'll create/update based on accountLogin
              this.logger.log(
                '🔧 Creating/updating integration from webhook...',
              );

              // Find existing integration by installation ID
              let existingIntegration =
                await this.integrationService.findByInstallationId(
                  installation.id.toString(),
                );

              if (!existingIntegration) {
                // Try to find by account login (for org matching)
                const integrations =
                  await this.integrationService.findByAccountLogin(
                    installation.account.login,
                  );
                existingIntegration = integrations[0] || null;
              }

              if (existingIntegration) {
                // Update existing integration
                this.logger.log(
                  `Updating existing integration ${existingIntegration.id}`,
                );
                await this.githubAppService.handleInstallationEvent(
                  installationPayload,
                  existingIntegration.organizationId,
                );
              } else {
                // New installation - log warning (callback should handle this)
                this.logger.warn(
                  `New installation ${installation.id} for ${installation.account.login} - ` +
                    `awaiting callback with organization context`,
                );
              }
              break;
            }

            case 'deleted': {
              this.logger.log('🗑️ Deactivating integration...');
              const integration =
                await this.integrationService.findByInstallationId(
                  installation.id.toString(),
                );
              if (integration) {
                await this.githubAppService.handleInstallationEvent(
                  installationPayload,
                  integration.organizationId,
                );
                this.logger.log(`Deactivated integration ${integration.id}`);
              } else {
                this.logger.warn(
                  `No integration found for installation ${installation.id}`,
                );
              }
              break;
            }

            case 'suspend': {
              this.logger.log('⏸️ Suspending integration...');
              const integration =
                await this.integrationService.findByInstallationId(
                  installation.id.toString(),
                );
              if (integration) {
                await this.githubAppService.handleInstallationEvent(
                  installationPayload,
                  integration.organizationId,
                );
                this.logger.log(`Suspended integration ${integration.id}`);
              }
              break;
            }

            case 'unsuspend': {
              this.logger.log('▶️ Unsuspending integration...');
              const integration =
                await this.integrationService.findByInstallationId(
                  installation.id.toString(),
                );
              if (integration) {
                await this.githubAppService.handleInstallationEvent(
                  installationPayload,
                  integration.organizationId,
                );
                this.logger.log(`Unsuspended integration ${integration.id}`);
              }
              break;
            }

            default:
              this.logger.log(`Unhandled installation action: ${action}`);
          }
        } catch (error) {
          this.logger.error(`Failed to process installation event: ${error}`);
          // Don't throw - webhook should still return 200
        }
        break;
      }

      case 'installation_repositories': {
        this.logger.log('📁 Processing INSTALLATION_REPOSITORIES event');
        await this.githubAppService.handleInstallationRepositoriesEvent(
          payload as unknown as Parameters<
            typeof this.githubAppService.handleInstallationRepositoriesEvent
          >[0],
        );
        break;
      }

      case 'push':
      case 'pull_request':
      case 'issues': {
        this.logger.log(
          `🔀 Forwarding ${event.toUpperCase()} event to legacy handler`,
        );
        await this.githubIntegrationService.handleWebhook(
          payload as unknown as GitHubWebhookPayload,
        );
        break;
      }

      default:
        this.logger.log(`📋 Received unhandled event type: ${event}`);
    }

    this.logger.log('✅ Webhook processed successfully');
    this.logger.log('='.repeat(60));

    return { received: true, event };
  }

  /**
   * Get GitHub App installation URL.
   * Redirects user to GitHub to install the app.
   */
  @Get('github-app/setup')
  @UseGuards(JwtAuthGuard)
  getGitHubAppInstallUrl(@Request() req: AuthenticatedRequest) {
    try {
      this.logger.log('GitHub App setup requested');
      this.logger.debug(
        `User: ${req.user?.id}, Org: ${req.user?.organizationId}`,
      );

      const organizationId = getRequiredOrganizationId(req);
      this.logger.debug(`Organization ID: ${organizationId}`);

      const isConfigured = this.githubAppService.isConfigured();
      this.logger.debug(`GitHub App configured: ${isConfigured}`);

      if (!isConfigured) {
        this.logger.warn(
          'GitHub App is not configured - missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY',
        );
        throw new BadRequestException(
          'GitHub App is not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in .env',
        );
      }

      // Generate state with user context
      const state = Buffer.from(
        JSON.stringify({
          userId: req.user.id,
          organizationId,
          timestamp: Date.now(),
        }),
      ).toString('base64');

      this.logger.debug('Generated state for OAuth');

      const installUrl = this.githubAppService.getInstallationUrl(state);
      const appId = this.githubAppService.getAppId();

      this.logger.log(`Generated install URL for app ${appId}`);

      return {
        installUrl,
        appId,
        configured: true,
      };
    } catch (error) {
      this.logger.error('GitHub App setup failed:', error);
      throw error;
    }
  }

  /**
   * Callback after GitHub App installation.
   * Creates the integration record.
   *
   * IMPORTANT: GitHub redirects here AFTER the user installs the app.
   * The `state` param contains encoded user/org context.
   * @Public() - No auth required, callback comes from GitHub redirect
   */
  @Public()
  @Get('github-app/callback')
  async handleGitHubAppCallback(
    @Query('installation_id') installationId: string,
    @Query('setup_action') setupAction: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    this.logger.log('=== GitHub App Callback Hit ===');
    this.logger.log(`Installation ID: ${installationId}`);
    this.logger.log(`Setup Action: ${setupAction}`);
    this.logger.log(
      `State: ${state ? state.substring(0, 50) + '...' : 'MISSING'}`,
    );

    // Validate installation ID
    if (!installationId) {
      this.logger.error('Missing installation_id in callback');
      return res.redirect(
        `${frontendUrl}/projects?error=missing_installation_id`,
      );
    }

    // Handle missing state (can happen if cookies cleared or different browser)
    if (!state) {
      this.logger.warn('Missing state parameter - cannot identify user/org');
      this.logger.warn(
        'Integration will be created when webhook fires instead',
      );
      return res.redirect(
        `${frontendUrl}/projects?github_connected=true&installation=${installationId}`,
      );
    }

    try {
      // Decode state to get user context
      this.logger.debug('Decoding state parameter...');
      let stateData: { userId: string; organizationId: string };

      try {
        stateData = JSON.parse(
          Buffer.from(state, 'base64').toString('utf-8'),
        ) as { userId: string; organizationId: string };
      } catch (parseError) {
        this.logger.error('Failed to parse state:', parseError);
        return res.redirect(`${frontendUrl}/projects?error=invalid_state`);
      }

      this.logger.log(`User ID: ${stateData.userId}`);
      this.logger.log(`Organization ID: ${stateData.organizationId}`);

      // Get installation details from GitHub
      this.logger.debug('Fetching repos from GitHub...');
      let repos: Array<{ full_name: string; name: string; private: boolean }> =
        [];

      try {
        repos =
          await this.githubAppService.listInstallationRepositories(
            installationId,
          );
        this.logger.log(`Found ${repos.length} repositories`);
      } catch (repoError) {
        this.logger.error(
          'Failed to fetch repos (will continue with empty list):',
          repoError,
        );
        // Continue anyway - we can sync repos later
      }

      // Create or update integration
      this.logger.debug('Creating integration record...');
      const integration = await this.githubAppService.handleInstallationEvent(
        {
          action: 'created',
          installation: {
            id: parseInt(installationId),
            account: {
              login: 'pending', // Will be updated by webhook
              id: 0,
              type: 'Organization',
            },
            repository_selection: 'selected',
            permissions: {},
            events: [],
          },
          repositories: repos.map((r, i) => ({
            id: i,
            name: r.name,
            full_name: r.full_name,
            private: r.private,
          })),
          sender: { login: 'callback', id: 0 },
        },
        stateData.organizationId,
      );

      this.logger.log('=== GitHub App Integration Created ===');
      this.logger.log(`Integration ID: ${integration?.id}`);
      this.logger.log(`Installation ID: ${installationId}`);
      this.logger.log(`Organization ID: ${stateData.organizationId}`);

      // Redirect to frontend with success (ACTUAL HTTP redirect)
      return res.redirect(
        `${frontendUrl}/projects?github_connected=true&installation=${installationId}`,
      );
    } catch (error) {
      this.logger.error('=== GitHub App Callback Error ===');
      this.logger.error('Error:', error);
      return res.redirect(
        `${frontendUrl}/projects?error=github_installation_failed`,
      );
    }
  }

  /**
   * Check if GitHub App is configured.
   */
  @Get('github-app/status')
  @UseGuards(JwtAuthGuard)
  async getGitHubAppStatus(@Request() req: AuthenticatedRequest) {
    const organizationId = getRequiredOrganizationId(req);
    const configured = this.githubAppService.isConfigured();

    // Check if there's an existing GitHub App integration
    const integrations =
      await this.integrationService.getIntegrations(organizationId);
    const githubAppIntegration = integrations.find(
      (i) =>
        i.type === IntegrationType.GITHUB &&
        i.installationId &&
        !i.isLegacyOAuth,
    );

    return {
      configured,
      hasInstallation: !!githubAppIntegration,
      integration: githubAppIntegration
        ? {
            id: githubAppIntegration.id,
            accountLogin: githubAppIntegration.accountLogin,
            accountType: githubAppIntegration.accountType,
            installationId: githubAppIntegration.installationId,
          }
        : null,
    };
  }
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
