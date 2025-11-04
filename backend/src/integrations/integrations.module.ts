import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from './entities/integration.entity';
import { ExternalData } from './entities/external-data.entity';
import { SyncLog } from './entities/sync-log.entity';
import { SearchIndex } from './entities/search-index.entity';
import { IntegrationService } from './services/integration.service';
import { SlackIntegrationService } from './services/slack-integration.service';
import { GitHubIntegrationService } from './services/github-integration.service';
import { JiraIntegrationService } from './services/jira-integration.service';
import { GoogleWorkspaceIntegrationService } from './services/google-workspace-integration.service';
import { MicrosoftTeamsIntegrationService } from './services/microsoft-teams-integration.service';
import { TrelloIntegrationService } from './services/trello-integration.service';
import { UniversalSearchService } from './services/universal-search.service';
import { IntegrationController } from './controllers/integration.controller';
import { IntegrationMarketplaceController } from './controllers/integration-marketplace.controller';
import { AuthModule } from '../auth/auth.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Integration, ExternalData, SyncLog, SearchIndex]),
    AuthModule,
    AccessControlModule,
  ],
  controllers: [IntegrationController, IntegrationMarketplaceController],
  providers: [
    IntegrationService,
    SlackIntegrationService,
    GitHubIntegrationService,
    JiraIntegrationService,
    GoogleWorkspaceIntegrationService,
    MicrosoftTeamsIntegrationService,
    TrelloIntegrationService,
    UniversalSearchService,
  ],
  exports: [
    IntegrationService,
    SlackIntegrationService,
    GitHubIntegrationService,
    JiraIntegrationService,
    GoogleWorkspaceIntegrationService,
    MicrosoftTeamsIntegrationService,
    TrelloIntegrationService,
    UniversalSearchService,
  ],
})
export class IntegrationsModule {}
