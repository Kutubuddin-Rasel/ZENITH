import { Module } from '@nestjs/common';
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
import { GitHubAppService } from './services/github-app.service';
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
import { IntegrationAlertService } from './services/integration-alert.service';
import { INTEGRATION_ALERT_ORCHESTRATOR_TOKEN } from '../common/constants/integration-alerting.tokens';
import { CommonAlertingModule } from '../common/submodules/alerting.module';
import { CommonObservabilityModule } from '../common/submodules/observability.module';
import { CommonSecurityModule } from '../common/submodules/security.module';
import { IntegrationController } from './controllers/integration.controller';
import { IntegrationMarketplaceController } from './controllers/integration-marketplace.controller';
import { OAuthController } from './controllers/oauth.controller';
import { AuthModule } from '../auth/auth.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { UsersModule } from '../users/users.module';
import { IssuesModule } from '../issues/issues.module';
import { ProjectsModule } from '../projects/projects.module';
import { RagModule } from '../rag/rag.module';
// Sprint 2: Import processor from new location
import { IntegrationSyncProcessor } from './processors/integration-sync.processor';

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
    CommonAlertingModule,
    CommonObservabilityModule,
    CommonSecurityModule,
    // Queue registration now in CoreQueueModule (global)
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
    GitHubAppService,
    JiraIntegrationService,
    GoogleWorkspaceIntegrationService,
    MicrosoftTeamsIntegrationService,
    TrelloIntegrationService,
    IntercomService,
    UniversalSearchService,
    IntegrationAlertService,
    {
      provide: INTEGRATION_ALERT_ORCHESTRATOR_TOKEN,
      useExisting: IntegrationAlertService,
    },
    // Sprint 2: Add processor to run in-process
    IntegrationSyncProcessor,
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
    GitHubAppService,
    JiraIntegrationService,
    GoogleWorkspaceIntegrationService,
    MicrosoftTeamsIntegrationService,
    TrelloIntegrationService,
    UniversalSearchService,
    IntercomService,
    IntegrationAlertService,
    INTEGRATION_ALERT_ORCHESTRATOR_TOKEN,
  ],
})
export class IntegrationsModule {}
