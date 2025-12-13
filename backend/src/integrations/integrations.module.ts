import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Integration } from './entities/integration.entity';
import { ExternalData } from './entities/external-data.entity';
import { SyncLog } from './entities/sync-log.entity';
import { SearchIndex } from './entities/search-index.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IntegrationOwnershipGuard } from './guards/integration-ownership.guard';
import { IntegrationService } from './services/integration.service';
import { SlackIntegrationService } from './services/slack-integration.service';
import { SlackNotificationBridgeService } from './services/slack-notification-bridge.service';
import { GitHubIntegrationService } from './services/github-integration.service';
import { GitHubIssueLinkService } from './services/github-issue-link.service';
import { JiraIntegrationService } from './services/jira-integration.service';
import { GoogleWorkspaceIntegrationService } from './services/google-workspace-integration.service';
import { MicrosoftTeamsIntegrationService } from './services/microsoft-teams-integration.service';
import { TrelloIntegrationService } from './services/trello-integration.service';
import { IntercomService } from './services/intercom.service';
import { UniversalSearchService } from './services/universal-search.service';
import { OAuthService } from './services/oauth.service';
import { WebhookVerificationService } from './services/webhook-verification.service';
import { TokenManagerService } from './services/token-manager.service';
import { RateLimitService } from './services/rate-limit.service';
import { IntegrationController } from './controllers/integration.controller';
import { IntegrationMarketplaceController } from './controllers/integration-marketplace.controller';
import { OAuthController } from './controllers/oauth.controller';
import { AuthModule } from '../auth/auth.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { QueueModule } from '../queue/queue.module';
import { UsersModule } from '../users/users.module';
import { IssuesModule } from '../issues/issues.module';
import { ProjectsModule } from '../projects/projects.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Integration,
      ExternalData,
      SyncLog,
      SearchIndex,
      Issue,
    ]),
    EventEmitterModule.forRoot(),
    AuthModule,
    AccessControlModule,
    forwardRef(() => QueueModule),
    UsersModule,
    IssuesModule,
    ProjectsModule,
    RagModule,
  ],
  controllers: [
    IntegrationController,
    IntegrationMarketplaceController,
    OAuthController,
  ],
  providers: [
    IntegrationService,
    OAuthService,
    WebhookVerificationService,
    TokenManagerService,
    RateLimitService,
    IntegrationOwnershipGuard,
    SlackIntegrationService,
    SlackNotificationBridgeService,
    GitHubIntegrationService,
    GitHubIssueLinkService,
    JiraIntegrationService,
    GoogleWorkspaceIntegrationService,
    MicrosoftTeamsIntegrationService,
    TrelloIntegrationService,
    IntercomService,
    UniversalSearchService,
  ],
  exports: [
    IntegrationService,
    OAuthService,
    WebhookVerificationService,
    TokenManagerService,
    RateLimitService,
    SlackIntegrationService,
    SlackNotificationBridgeService,
    GitHubIntegrationService,
    GitHubIssueLinkService,
    JiraIntegrationService,
    GoogleWorkspaceIntegrationService,
    MicrosoftTeamsIntegrationService,
    TrelloIntegrationService,
    UniversalSearchService,
    IntercomService,
  ],
})
export class IntegrationsModule { }
