import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData, MappedData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';
import { RateLimitService } from './rate-limit.service';
import { TokenManagerService } from './token-manager.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { BaseIntegrationService } from './base-integration.service';

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

import { UsersService } from '../../users/users.service';
import { IssuesService } from '../../issues/issues.service';
import { IssuePriority, IssueType } from '../../issues/entities/issue.entity';

@Injectable()
export class JiraIntegrationService extends BaseIntegrationService {
  protected readonly logger = new Logger(JiraIntegrationService.name);
  protected readonly source = 'jira';
  private readonly jiraApiBase = 'https://api.atlassian.com/ex/jira'; // Placeholder base, usually dynamically constructed with cloudId

  constructor(
    @InjectRepository(Integration)
    integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    searchIndexRepo: Repository<SearchIndex>,
    rateLimitService: RateLimitService,
    tokenManagerService: TokenManagerService,
    encryptionService: EncryptionService,
    private readonly usersService: UsersService,
    private readonly issuesService: IssuesService,
  ) {
    super(
      integrationRepo,
      externalDataRepo,
      searchIndexRepo,
      rateLimitService,
      tokenManagerService,
      encryptionService,
    );
  }

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
            syncedProjects.push({
              ...project,
              description: project.description || '',
              projectTypeKey: project.projectTypeKey || '',
              lead: project.lead
                ? { displayName: project.lead.displayName, emailAddress: '' }
                : { displayName: '', emailAddress: '' },
              avatarUrls: project.avatarUrls || { '48x48': '' },
              projectCategory: project.projectCategory ?? null,
            });
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
        // Map to proper JiraIssue structure
        syncedIssues.push({
          id: issue.id,
          key: issue.key,
          summary: issue.fields.summary,
          description: issue.fields.description || '',
          status: {
            name: issue.fields.status.name,
            statusCategory: { name: '' },
          },
          priority: issue.fields.priority || { name: 'Medium' },
          issueType: {
            name: issue.fields.issuetype.name,
            iconUrl: '',
          },
          assignee: issue.fields.assignee
            ? {
                displayName: issue.fields.assignee.displayName,
                emailAddress: '',
                avatarUrls: { '48x48': '' },
              }
            : null,
          reporter: {
            displayName: issue.fields.reporter?.displayName || '',
            emailAddress: '',
            avatarUrls: { '48x48': '' },
          },
          created: '',
          updated: '',
          resolution: null,
          labels: issue.fields.labels || [],
          components: issue.fields.components || [],
          fixVersions: issue.fields.fixVersions || [],
          customFields: {},
        });
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

  private mapJiraPriorityToZenith(jiraPriority: string): IssuePriority {
    const p = (jiraPriority || '').toLowerCase();
    if (
      p.includes('highest') ||
      p.includes('critical') ||
      p.includes('blocker')
    )
      return IssuePriority.HIGHEST;
    if (p.includes('high')) return IssuePriority.HIGH;
    if (p.includes('low')) return IssuePriority.LOW;
    if (p.includes('lowest')) return IssuePriority.LOWEST;
    return IssuePriority.MEDIUM;
  }

  private mapJiraTypeToZenith(jiraType: string): IssueType {
    const t = (jiraType || '').toLowerCase();
    if (t === 'story') return IssueType.STORY;
    if (t === 'bug') return IssueType.BUG;
    if (t === 'epic') return IssueType.EPIC;
    if (t === 'sub-task' || t === 'subtask') return IssueType.SUBTASK;
    return IssueType.TASK;
  }

  async importIssue(
    integrationId: string,
    jiraIssue: JiraIssue,
    targetProjectId: string,
  ): Promise<any> {
    try {
      this.logger.log(
        `Importing Jira issue ${jiraIssue.key} to project ${targetProjectId}`,
      );

      const integration = await this.integrationRepo.findOneBy({
        id: integrationId,
      });
      if (!integration) throw new Error('Integration not found');

      // Resolve Reporter
      let reporterId: string;
      const reporterEmail = jiraIssue.reporter?.emailAddress;
      if (reporterEmail) {
        const reporter = await this.usersService.findOneByEmail(reporterEmail);
        if (reporter) {
          reporterId = reporter.id;
        } else {
          // Fallback: throw error or find a default.
          // For now, fail if reporter not found.
          throw new Error(
            `Zenith user not found for Jira reporter email: ${reporterEmail}`,
          );
        }
      } else {
        // No email (GDPR hidden).
        throw new Error(
          'Jira issue reporter has no email visible. Cannot map to Zenith user.',
        );
      }

      // Resolve Assignee
      let assigneeId: string | undefined;
      const assigneeEmail = jiraIssue.assignee?.emailAddress;
      if (assigneeEmail) {
        const assignee = await this.usersService.findOneByEmail(assigneeEmail);
        if (assignee) assigneeId = assignee.id;
      }

      // Create Issue
      const issue = await this.issuesService.create(
        targetProjectId,
        reporterId,
        {
          title: jiraIssue.summary,
          description:
            jiraIssue.description || `Imported from Jira ${jiraIssue.key}`,
          priority: this.mapJiraPriorityToZenith(jiraIssue.priority?.name),
          type: this.mapJiraTypeToZenith(jiraIssue.issueType?.name),
          assigneeId,
          storyPoints: undefined,
          metadata: {
            jiraKey: jiraIssue.key,
            jiraId: jiraIssue.id,
            jiraLink: `https://jira.atlassian.com/browse/${jiraIssue.key}`, // Base URL assumption?
          },
        },
      );
      // Store the import mapping
      await this.storeExternalData(
        integrationId,
        'imported_issue',
        jiraIssue.id,
        {
          jiraIssue,
          targetProjectId,
          importedAt: new Date(),
          zenithIssueId: issue.id,
          zenithIssueNumber: issue.number,
        },
      );

      return {
        success: true,
        message: `Issue ${jiraIssue.key} imported successfully as ${issue.title}`,
        zenithIssueId: issue.id,
      };
    } catch (error) {
      this.logger.error('Failed to import Jira issue:', error);
      throw error;
    }
  }

  async exportIssue(
    integrationId: string,
    localIssue: Record<string, unknown>,
    jiraProjectKey: string,
  ): Promise<Record<string, unknown>> {
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
          summary: (localIssue.title as string) || '',
          description: (localIssue.description as string) || '',
          issuetype: { name: 'Task' },
          priority: {
            name: this.mapZenithPriorityToJira(
              (localIssue.priority as string) || 'medium',
            ),
          },
          labels: (localIssue.labels as string[]) || [],
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
        const createdIssue = (await response.json()) as Record<string, unknown>;
        this.logger.log(
          `Exported issue to Jira: ${(createdIssue.key as string) || ''}`,
        );

        // Store the export mapping
        await this.storeExternalData(
          integrationId,
          'exported_issue',
          (createdIssue.id as string) || '',
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

      const transitionsData = (await transitionsResponse.json()) as Record<
        string,
        unknown
      >;
      const transitions =
        (transitionsData.transitions as Array<Record<string, unknown>>) || [];
      const transition = transitions.find(
        (t) =>
          ((t.name as string) || '').toLowerCase() === newStatus.toLowerCase(),
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
            transition: { id: (transition.id as string) || '' },
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
    const config = integration.config as Record<string, unknown>;
    return {
      baseUrl: (config.jiraUrl as string) || '',
      username: integration.authConfig.apiKey || '',
      apiToken: integration.authConfig.accessToken || '',
    };
  }

  private mapZenithPriorityToJira(priority: string): string {
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

  /**
   * Maps Jira data to standard MappedData format.
   * Implements abstract method from BaseIntegrationService.
   */
  protected mapExternalData(
    type: string,
    data: Record<string, unknown>,
  ): MappedData | null {
    switch (type) {
      case 'project':
        return {
          title: (data.name as string) || '',
          content: (data.description as string) || '',
          author:
            ((data.lead as Record<string, unknown>)?.displayName as string) ||
            '',
          source: 'jira',
          url: (data.avatarUrls as Record<string, string>)?.['48x48'] || '',
          metadata: {
            key: (data.key as string) || '',
            projectType: (data.projectTypeKey as string) || '',
            category:
              ((data.projectCategory as Record<string, unknown>)
                ?.name as string) || '',
            lead:
              ((data.lead as Record<string, unknown>)
                ?.emailAddress as string) || '',
          },
        };
      case 'issue':
        return {
          title: `${data.key as string}: ${data.summary as string}`,
          content: (data.description as string) || '',
          author:
            ((data.reporter as Record<string, unknown>)
              ?.displayName as string) || '',
          source: 'jira',
          url: (data.key as string) || '',
          metadata: {
            key: (data.key as string) || '',
            status:
              ((data.status as Record<string, unknown>)?.name as string) || '',
            priority:
              ((data.priority as Record<string, unknown>)?.name as string) ||
              '',
            issueType:
              ((data.issueType as Record<string, unknown>)?.name as string) ||
              '',
            assignee:
              ((data.assignee as Record<string, unknown>)
                ?.displayName as string) || '',
            labels: (data.labels as string[]) || [],
            components: (
              (data.components as Array<Record<string, unknown>>) || []
            ).map((c) => c.name as string),
            fixVersions: (
              (data.fixVersions as Array<Record<string, unknown>>) || []
            ).map((v) => v.name as string),
            projectKey: (data.projectKey as string) || '',
          },
        };
      default:
        return null;
    }
  }
}
