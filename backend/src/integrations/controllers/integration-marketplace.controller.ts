import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { IntegrationType } from '../entities/integration.entity';

@Controller('api/integrations/marketplace')
export class IntegrationMarketplaceController {
  @Public()
  @Get('test')
  test() {
    return { message: 'Marketplace test endpoint works!' };
  }

  @Public()
  @Get('available')
  getAvailableIntegrations() {
    return {
      integrations: [
        {
          type: IntegrationType.SLACK,
          name: 'Slack',
          description:
            'Connect with Slack for notifications and team communication',
          icon: '💬',
          status: 'available',
          features: [
            'Real-time notifications',
            'Slash commands',
            'Channel integration',
          ],
        },
        {
          type: IntegrationType.GITHUB,
          name: 'GitHub',
          description: 'Sync with GitHub repositories and pull requests',
          icon: '🐙',
          status: 'available',
          features: ['Repository sync', 'PR tracking', 'Commit linking'],
        },
        {
          type: IntegrationType.JIRA,
          name: 'Jira',
          description: 'Import and sync issues with Jira',
          icon: '🔧',
          status: 'available',
          features: [
            'Issue import/export',
            'Status sync',
            'Bidirectional updates',
          ],
        },
        {
          type: IntegrationType.GOOGLE_WORKSPACE,
          name: 'Google Workspace',
          description: 'Integrate with Google Calendar, Drive, and Gmail',
          icon: '📧',
          status: 'available',
          features: [
            'Calendar sync',
            'Drive integration',
            'Email notifications',
          ],
        },
        {
          type: IntegrationType.MICROSOFT_TEAMS,
          name: 'Microsoft Teams',
          description: 'Connect with Microsoft Teams for collaboration',
          icon: '👥',
          status: 'available',
          features: [
            'Team notifications',
            'Meeting integration',
            'File sharing',
          ],
        },
        {
          type: IntegrationType.TRELLO,
          name: 'Trello',
          description: 'Sync boards and cards with Trello',
          icon: '📋',
          status: 'available',
          features: ['Board sync', 'Card tracking', 'List management'],
        },
      ],
    };
  }
}
