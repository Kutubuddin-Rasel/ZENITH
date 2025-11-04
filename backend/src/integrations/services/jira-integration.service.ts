import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';

export interface JiraIssue {
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
  customFields: Record<string, any>;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description: string;
  projectTypeKey: string;
  lead: {
    displayName: string;
    emailAddress: string;
  };
  avatarUrls: {
    '48x48': string;
  };
  projectCategory: {
    name: string;
  } | null;
}

export interface JiraWebhookPayload {
  timestamp: number;
  webhookEvent: string;
  issue?: JiraIssue;
  project?: JiraProject;
  user?: {
    displayName: string;
    emailAddress: string;
  };
  changelog?: {
    items: Array<{
      field: string;
      fieldtype: string;
      from: string;
      fromString: string;
      to: string;
      toString: string;
    }>;
  };
}

@Injectable()
export class JiraIntegrationService {
  private readonly logger = new Logger(JiraIntegrationService.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
  ) {}

  async syncProjects(integrationId: string): Promise<JiraProject[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.JIRA },
      });

      if (!integration) {
        throw new Error('Jira integration not found');
      }

      const { baseUrl, username, apiToken } =
        this.getJiraCredentials(integration);
      const projects = integration.config.projects || [];

      const syncedProjects: JiraProject[] = [];

      for (const projectKey of projects) {
        try {
          const response = await fetch(
            `${baseUrl}/rest/api/3/project/${projectKey}`,
            {
              headers: {
                Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`,
                Accept: 'application/json',
              },
            },
          );

          if (response.ok) {
            const project = (await response.json()) as {
              id: string;
              key: string;
              name: string;
              description?: string;
              lead?: { displayName: string };
              avatarUrls?: { '48x48': string };
              projectTypeKey?: string;
              projectCategory?: { name: string };
            };
            syncedProjects.push(project);
            await this.storeExternalData(
              integrationId,
              'project',
              project.id,
              project,
            );
          } else {
            this.logger.warn(
              `Failed to sync Jira project ${projectKey}: ${response.status}`,
            );
          }
        } catch (error) {
          this.logger.error(`Error syncing Jira project ${projectKey}:`, error);
        }
      }

      this.logger.log(`Synced ${syncedProjects.length} Jira projects`);
      return syncedProjects;
    } catch (error) {
      this.logger.error('Failed to sync Jira projects:', error);
      throw error;
    }
  }

  async syncIssues(
    integrationId: string,
    projectKey: string,
  ): Promise<JiraIssue[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.JIRA },
      });

      if (!integration) {
        throw new Error('Jira integration not found');
      }

      const { baseUrl, username, apiToken } =
        this.getJiraCredentials(integration);

      const response = await fetch(
        `${baseUrl}/rest/api/3/search?jql=project=${projectKey}&maxResults=100`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`,
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        issues: Array<{
          id: string;
          key: string;
          fields: {
            summary: string;
            description?: string;
            priority?: { name: string };
            labels?: string[];
            components?: Array<{ name: string }>;
            fixVersions?: Array<{ name: string }>;
            projectKey: string;
            status: { name: string };
            issuetype: { name: string };
            assignee?: { displayName: string };
            reporter?: { displayName: string };
          };
        }>;
      };
      const issues = data.issues || [];
      const syncedIssues: JiraIssue[] = [];

      for (const issue of issues) {
        syncedIssues.push(issue.fields);
        await this.storeExternalData(integrationId, 'issue', issue.id, {
          ...issue.fields,
          id: issue.id,
          key: issue.key,
          projectKey,
          syncedAt: new Date(),
        });
      }

      this.logger.log(
        `Synced ${syncedIssues.length} Jira issues from project ${projectKey}`,
      );
      return syncedIssues;
    } catch (error) {
      this.logger.error('Failed to sync Jira issues:', error);
      throw error;
    }
  }

  async importIssue(
    integrationId: string,
    jiraIssue: JiraIssue,
    targetProjectId: string,
  ): Promise<any> {
    try {
      // This would create an issue in the project management system based on the Jira issue
      this.logger.log(
        `Importing Jira issue ${jiraIssue.key} to project ${targetProjectId}`,
      );

      // For now, just store the import mapping
      await this.storeExternalData(
        integrationId,
        'imported_issue',
        jiraIssue.id,
        {
          jiraIssue,
          targetProjectId,
          importedAt: new Date(),
        },
      );

      return {
        success: true,
        message: `Issue ${jiraIssue.key} imported successfully`,
      };
    } catch (error) {
      this.logger.error('Failed to import Jira issue:', error);
      throw error;
    }
  }

  async exportIssue(
    integrationId: string,
    localIssue: any,
    jiraProjectKey: string,
  ): Promise<any> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.JIRA },
      });

      if (!integration) {
        throw new Error('Jira integration not found');
      }

      const { baseUrl, username, apiToken } =
        this.getJiraCredentials(integration);

      const jiraIssue = {
        fields: {
          project: { key: jiraProjectKey },
          summary: localIssue.title,
          description: localIssue.description,
          issuetype: { name: 'Task' },
          priority: { name: this.mapPriority(localIssue.priority) },
          labels: localIssue.labels || [],
        },
      };

      const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jiraIssue),
      });

      if (response.ok) {
        const createdIssue = await response.json();
        this.logger.log(`Exported issue to Jira: ${createdIssue.key}`);

        // Store the export mapping
        await this.storeExternalData(
          integrationId,
          'exported_issue',
          createdIssue.id,
          {
            localIssue,
            jiraIssue: createdIssue,
            exportedAt: new Date(),
          },
        );

        return createdIssue;
      } else {
        throw new Error(`Jira API error: ${response.status}`);
      }
    } catch (error) {
      this.logger.error('Failed to export issue to Jira:', error);
      throw error;
    }
  }

  async syncIssueStatus(
    integrationId: string,
    jiraIssueKey: string,
    newStatus: string,
  ): Promise<void> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.JIRA },
      });

      if (!integration) {
        throw new Error('Jira integration not found');
      }

      const { baseUrl, username, apiToken } =
        this.getJiraCredentials(integration);

      // Get available transitions
      const transitionsResponse = await fetch(
        `${baseUrl}/rest/api/3/issue/${jiraIssueKey}/transitions`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`,
            Accept: 'application/json',
          },
        },
      );

      if (!transitionsResponse.ok) {
        throw new Error(`Jira API error: ${transitionsResponse.status}`);
      }

      const transitionsData = await transitionsResponse.json();
      const transition = transitionsData.transitions.find(
        (t: any) => t.name.toLowerCase() === newStatus.toLowerCase(),
      );

      if (!transition) {
        throw new Error(`No transition found for status: ${newStatus}`);
      }

      // Execute the transition
      const updateResponse = await fetch(
        `${baseUrl}/rest/api/3/issue/${jiraIssueKey}/transitions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transition: { id: transition.id },
          }),
        },
      );

      if (updateResponse.ok) {
        this.logger.log(
          `Updated Jira issue ${jiraIssueKey} status to ${newStatus}`,
        );
      } else {
        throw new Error(
          `Failed to update Jira issue status: ${updateResponse.status}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to sync issue status:', error);
      throw error;
    }
  }

  async handleWebhook(payload: JiraWebhookPayload): Promise<void> {
    try {
      this.logger.log(`Received Jira webhook: ${payload.webhookEvent}`);

      // Find the integration for this project
      const integration = await this.integrationRepo.findOne({
        where: {
          type: IntegrationType.JIRA,
        },
      });

      if (!integration) {
        this.logger.warn(
          `No integration found for Jira project ${payload.project?.key}`,
        );
        return;
      }

      // Handle different webhook events
      switch (payload.webhookEvent) {
        case 'jira:issue_created':
        case 'jira:issue_updated':
        case 'jira:issue_deleted':
          if (payload.issue) {
            await this.handleIssueEvent(
              integration.id,
              payload.issue,
              payload.project!,
            );
          }
          break;
        case 'jira:project_created':
        case 'jira:project_updated':
          if (payload.project) {
            await this.handleProjectEvent(integration.id, payload.project);
          }
          break;
        default:
          this.logger.log(
            `Unhandled Jira webhook event: ${payload.webhookEvent}`,
          );
      }
    } catch (error) {
      this.logger.error('Failed to handle Jira webhook:', error);
    }
  }

  private getJiraCredentials(integration: Integration): {
    baseUrl: string;
    username: string;
    apiToken: string;
  } {
    const config = integration.config as any;
    return {
      baseUrl: config.jiraUrl || '',
      username: integration.authConfig.apiKey || '',
      apiToken: integration.authConfig.accessToken || '',
    };
  }

  private mapPriority(priority: string): string {
    const priorityMap: Record<string, string> = {
      critical: 'Highest',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      lowest: 'Lowest',
    };
    return priorityMap[priority.toLowerCase()] || 'Medium';
  }

  private async handleIssueEvent(
    integrationId: string,
    issue: JiraIssue,
    project: JiraProject,
  ): Promise<void> {
    await this.storeExternalData(integrationId, 'issue', issue.id, {
      ...issue,
      projectKey: project.key,
      syncedAt: new Date(),
    });
  }

  private async handleProjectEvent(
    integrationId: string,
    project: JiraProject,
  ): Promise<void> {
    await this.storeExternalData(integrationId, 'project', project.id, {
      ...project,
      syncedAt: new Date(),
    });
  }

  private async storeExternalData(
    integrationId: string,
    type: string,
    externalId: string,
    data: any,
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

      const mappedData = this.mapJiraData(type, data);

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

  private mapJiraData(type: string, data: any): any {
    switch (type) {
      case 'project':
        return {
          title: data.name,
          content: data.description || '',
          author: data.lead.displayName,
          source: 'jira',
          url: `${data.avatarUrls['48x48']}`,
          metadata: {
            key: data.key,
            projectType: data.projectTypeKey,
            category: data.projectCategory?.name,
            lead: data.lead.emailAddress,
          },
        };
      case 'issue':
        return {
          title: `${data.key}: ${data.summary}`,
          content: data.description || '',
          author: data.reporter.displayName,
          source: 'jira',
          url: `${data.key}`,
          metadata: {
            key: data.key,
            status: data.status.name,
            priority: data.priority.name,
            issueType: data.issueType.name,
            assignee: data.assignee?.displayName,
            labels: data.labels,
            components: data.components.map((c: any) => c.name),
            fixVersions: data.fixVersions.map((v: any) => v.name),
            projectKey: data.projectKey,
          },
        };
      default:
        return null;
    }
  }

  private async updateSearchIndex(
    integrationId: string,
    type: string,
    externalId: string,
    mappedData: any,
  ): Promise<void> {
    try {
      const searchContent =
        `${mappedData.title} ${mappedData.content}`.toLowerCase();

      const existing = await this.searchIndexRepo.findOne({
        where: {
          integrationId,
          contentType: type,
        },
      });

      if (existing) {
        existing.title = mappedData.title;
        existing.content = mappedData.content;
        existing.metadata = mappedData.metadata;
        existing.searchVector = searchContent;
        existing.updatedAt = new Date();
        await this.searchIndexRepo.save(existing);
      } else {
        const searchIndex = this.searchIndexRepo.create({
          integrationId,
          contentType: type,
          title: mappedData.title,
          content: mappedData.content,
          metadata: mappedData.metadata,
          searchVector: searchContent,
        });
        await this.searchIndexRepo.save(searchIndex);
      }
    } catch (error) {
      this.logger.error('Failed to update search index:', error);
    }
  }
}
