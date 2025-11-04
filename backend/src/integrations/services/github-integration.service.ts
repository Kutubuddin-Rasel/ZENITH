import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
  };
  updated_at: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  assignees: Array<{
    login: string;
    id: number;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  milestone: {
    title: string;
    number: number;
  } | null;
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
  };
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  assignees: Array<{
    login: string;
    id: number;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
  }>;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  mergeable: boolean;
  mergeable_state: string;
  merged_by: {
    login: string;
    id: number;
    avatar_url: string;
  } | null;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login: string;
    id: number;
    avatar_url: string;
  };
  committer: {
    login: string;
    id: number;
    avatar_url: string;
  };
  html_url: string;
  parents: Array<{
    sha: string;
    html_url: string;
  }>;
}

export interface GitHubWebhookPayload {
  action: string;
  repository: GitHubRepository;
  issue?: GitHubIssue;
  pull_request?: GitHubPullRequest;
  sender: {
    login: string;
    id: number;
    avatar_url: string;
  };
}

@Injectable()
export class GitHubIntegrationService {
  private readonly logger = new Logger(GitHubIntegrationService.name);
  private readonly githubApiBase = 'https://api.github.com';

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
  ) {}

  async syncRepositories(integrationId: string): Promise<GitHubRepository[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GITHUB },
      });

      if (!integration) {
        throw new Error('GitHub integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('GitHub access token not found');
      }

      const repositories = integration.config.repositories || [];
      const syncedRepos: GitHubRepository[] = [];

      for (const repoName of repositories) {
        try {
          const response = await fetch(
            `${this.githubApiBase}/repos/${repoName}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
              },
            },
          );

          if (response.ok) {
            const repo = (await response.json()) as Record<string, unknown>;
            syncedRepos.push(repo as unknown as GitHubRepository);
            await this.storeExternalData(
              integrationId,
              'repository',
              (repo.id as number).toString(),
              repo,
            );
          } else {
            this.logger.warn(
              `Failed to sync repository ${repoName}: ${response.status}`,
            );
          }
        } catch (error) {
          this.logger.error(`Error syncing repository ${repoName}:`, error);
        }
      }

      this.logger.log(`Synced ${syncedRepos.length} GitHub repositories`);
      return syncedRepos;
    } catch (error) {
      this.logger.error('Failed to sync GitHub repositories:', error);
      throw error;
    }
  }

  async syncIssues(
    integrationId: string,
    repository: string,
  ): Promise<GitHubIssue[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GITHUB },
      });

      if (!integration) {
        throw new Error('GitHub integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('GitHub access token not found');
      }

      const response = await fetch(
        `${this.githubApiBase}/repos/${repository}/issues?state=all&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const issues = (await response.json()) as Record<string, unknown>[];
      const syncedIssues: GitHubIssue[] = [];

      for (const issue of issues) {
        // Skip pull requests (they appear in issues endpoint but have pull_request field)
        if (issue.pull_request) {
          continue;
        }

        syncedIssues.push(issue as unknown as GitHubIssue);
        await this.storeExternalData(
          integrationId,
          'issue',
          (issue.id as number).toString(),
          {
            ...issue,
            repository,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(
        `Synced ${syncedIssues.length} GitHub issues from ${repository}`,
      );
      return syncedIssues;
    } catch (error) {
      this.logger.error('Failed to sync GitHub issues:', error);
      throw error;
    }
  }

  async syncPullRequests(
    integrationId: string,
    repository: string,
  ): Promise<GitHubPullRequest[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GITHUB },
      });

      if (!integration) {
        throw new Error('GitHub integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('GitHub access token not found');
      }

      const response = await fetch(
        `${this.githubApiBase}/repos/${repository}/pulls?state=all&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const pullRequests = (await response.json()) as Record<string, unknown>[];
      const syncedPRs: GitHubPullRequest[] = [];

      for (const pr of pullRequests) {
        syncedPRs.push(pr as unknown as GitHubPullRequest);
        await this.storeExternalData(
          integrationId,
          'pull_request',
          (pr.id as number).toString(),
          {
            ...pr,
            repository,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(
        `Synced ${syncedPRs.length} GitHub pull requests from ${repository}`,
      );
      return syncedPRs;
    } catch (error) {
      this.logger.error('Failed to sync GitHub pull requests:', error);
      throw error;
    }
  }

  async syncCommits(
    integrationId: string,
    repository: string,
    branch = 'main',
  ): Promise<GitHubCommit[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.GITHUB },
      });

      if (!integration) {
        throw new Error('GitHub integration not found');
      }

      const accessToken = integration.authConfig.accessToken;
      if (!accessToken) {
        throw new Error('GitHub access token not found');
      }

      const response = await fetch(
        `${this.githubApiBase}/repos/${repository}/commits?sha=${branch}&per_page=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const commits = (await response.json()) as Record<string, unknown>[];
      const syncedCommits: GitHubCommit[] = [];

      for (const commit of commits) {
        syncedCommits.push(commit as unknown as GitHubCommit);
        await this.storeExternalData(
          integrationId,
          'commit',
          commit.sha as string,
          {
            ...commit,
            repository,
            branch,
            syncedAt: new Date(),
          },
        );
      }

      this.logger.log(
        `Synced ${syncedCommits.length} GitHub commits from ${repository}/${branch}`,
      );
      return syncedCommits;
    } catch (error) {
      this.logger.error('Failed to sync GitHub commits:', error);
      throw error;
    }
  }

  async handleWebhook(payload: GitHubWebhookPayload): Promise<void> {
    try {
      this.logger.log(
        `Received GitHub webhook: ${payload.action} for ${payload.repository.full_name}`,
      );

      // Find the integration for this repository
      const integration = await this.integrationRepo.findOne({
        where: {
          type: IntegrationType.GITHUB,
          config: {
            repositories: [payload.repository.full_name],
          },
        },
      });

      if (!integration) {
        this.logger.warn(
          `No integration found for repository ${payload.repository.full_name}`,
        );
        return;
      }

      // Handle different webhook events
      switch (payload.action) {
        case 'opened':
        case 'closed':
        case 'reopened':
        case 'edited':
          if (payload.issue) {
            await this.handleIssueEvent(
              integration.id,
              payload.issue,
              payload.repository,
            );
          } else if (payload.pull_request) {
            await this.handlePullRequestEvent(
              integration.id,
              payload.pull_request,
              payload.repository,
            );
          }
          break;
        case 'created':
          // Handle comment creation
          break;
        case 'assigned':
        case 'unassigned':
          // Handle assignment changes
          break;
        case 'labeled':
        case 'unlabeled':
          // Handle label changes
          break;
        default:
          this.logger.log(`Unhandled GitHub webhook action: ${payload.action}`);
      }
    } catch (error) {
      this.logger.error('Failed to handle GitHub webhook:', error);
    }
  }

  async createIssueFromPR(
    integrationId: string,
    prData: GitHubPullRequest,
    repository: string,
  ): Promise<void> {
    try {
      // This would create an issue in the project management system based on the PR
      // For now, just log the action
      this.logger.log(
        `Creating issue from PR #${prData.number} in ${repository}`,
      );

      // Store the PR data for reference
      await this.storeExternalData(
        integrationId,
        'pr_to_issue',
        prData.id.toString(),
        {
          ...prData,
          repository,
          convertedAt: new Date(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to create issue from PR:', error);
    }
  }

  async linkCommitToIssue(
    integrationId: string,
    commitData: GitHubCommit,
    issueNumber: number,
    repository: string,
  ): Promise<void> {
    try {
      // This would link the commit to an issue in the project management system
      this.logger.log(
        `Linking commit ${commitData.sha} to issue #${issueNumber} in ${repository}`,
      );

      // Store the commit-issue link
      await this.storeExternalData(
        integrationId,
        'commit_issue_link',
        `${commitData.sha}-${issueNumber}`,
        {
          commit: commitData,
          issueNumber,
          repository,
          linkedAt: new Date(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to link commit to issue:', error);
    }
  }

  private async handleIssueEvent(
    integrationId: string,
    issue: GitHubIssue,
    repository: GitHubRepository,
  ): Promise<void> {
    await this.storeExternalData(integrationId, 'issue', issue.id.toString(), {
      ...issue,
      repository: repository.full_name,
      syncedAt: new Date(),
    });
  }

  private async handlePullRequestEvent(
    integrationId: string,
    pr: GitHubPullRequest,
    repository: GitHubRepository,
  ): Promise<void> {
    await this.storeExternalData(
      integrationId,
      'pull_request',
      pr.id.toString(),
      {
        ...pr,
        repository: repository.full_name,
        syncedAt: new Date(),
      },
    );
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

      const mappedData = this.mapGitHubData(
        type,
        data as Record<string, unknown>,
      );

      if (existing) {
        existing.rawData = data as Record<string, unknown>;
        existing.mappedData = mappedData;
        existing.lastSyncAt = new Date();
        await this.externalDataRepo.save(existing);
      } else {
        const externalData = this.externalDataRepo.create({
          integrationId,
          externalId,
          externalType: type,
          rawData: data as Record<string, unknown>,
          mappedData: mappedData,
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

  private mapGitHubData(
    type: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (type) {
      case 'repository':
        return {
          title: data.full_name as string,
          content: (data.description as string) || '',
          author: (data.owner as Record<string, unknown>).login as string,
          source: 'github',
          url: data.html_url as string,
          metadata: {
            private: data.private as boolean,
            defaultBranch: data.default_branch as string,
            language: data.language as string,
            stars: data.stargazers_count as number,
            forks: data.forks_count as number,
            openIssues: data.open_issues_count as number,
          },
        };
      case 'issue':
        return {
          title: `#${data.number as number}: ${data.title as string}`,
          content: (data.body as string) || '',
          author: (data.user as Record<string, unknown>).login as string,
          source: 'github',
          url: data.html_url as string,
          metadata: {
            number: data.number as number,
            state: data.state as string,
            labels: ((data.labels as Record<string, unknown>[]) || []).map(
              (l: Record<string, unknown>) => l.name as string,
            ),
            assignees: (
              (data.assignees as Record<string, unknown>[]) || []
            ).map((a: Record<string, unknown>) => a.login as string),
            milestone: (data.milestone as Record<string, unknown>)
              ?.title as string,
            repository: data.repository as Record<string, unknown>,
          },
        };
      case 'pull_request':
        return {
          title: `PR #${data.number as number}: ${data.title as string}`,
          content: (data.body as string) || '',
          author: (data.user as Record<string, unknown>).login as string,
          source: 'github',
          url: data.html_url as string,
          metadata: {
            number: data.number as number,
            state: data.state as string,
            labels: ((data.labels as Record<string, unknown>[]) || []).map(
              (l: Record<string, unknown>) => l.name as string,
            ),
            assignees: (
              (data.assignees as Record<string, unknown>[]) || []
            ).map((a: Record<string, unknown>) => a.login as string),
            headBranch: (data.head as Record<string, unknown>).ref as string,
            baseBranch: (data.base as Record<string, unknown>).ref as string,
            mergeable: data.mergeable as boolean,
            repository: data.repository as Record<string, unknown>,
          },
        };
      case 'commit':
        return {
          title: (
            (data.commit as Record<string, unknown>).message as string
          ).split('\n')[0],
          content: (data.commit as Record<string, unknown>).message as string,
          author: (
            (data.commit as Record<string, unknown>).author as Record<
              string,
              unknown
            >
          ).name as string,
          source: 'github',
          url: data.html_url as string,
          metadata: {
            sha: data.sha as string,
            shortSha: (data.sha as string).substring(0, 7),
            author: (data.author as Record<string, unknown>).login as string,
            committer: (data.committer as Record<string, unknown>)
              .login as string,
            repository: data.repository as Record<string, unknown>,
            branch: data.branch as string,
          },
        };
      default:
        return null as unknown as Record<string, unknown>;
    }
  }

  private async updateSearchIndex(
    integrationId: string,
    type: string,
    externalId: string,
    mappedData: Record<string, unknown>,
  ): Promise<void> {
    try {
      const searchContent =
        `${mappedData.title as string} ${mappedData.content as string}`.toLowerCase();

      const existing = await this.searchIndexRepo.findOne({
        where: {
          integrationId,
          contentType: type,
        },
      });

      if (existing) {
        existing.title = mappedData.title as string;
        existing.content = mappedData.content as string;
        existing.metadata =
          (mappedData as { metadata?: Record<string, unknown> }).metadata || {};
        existing.searchVector = searchContent;
        existing.updatedAt = new Date();
        await this.searchIndexRepo.save(existing);
      } else {
        const searchIndex = this.searchIndexRepo.create({
          integrationId,
          contentType: type,
          title: mappedData.title as string,
          content: mappedData.content as string,
          metadata: mappedData.metadata as Record<string, unknown>,
          searchVector: searchContent,
        });
        await this.searchIndexRepo.save(searchIndex);
      }
    } catch (error) {
      this.logger.error('Failed to update search index:', error);
    }
  }
}
