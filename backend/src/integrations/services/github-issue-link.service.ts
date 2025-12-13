import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue, IssueStatus } from '../../issues/entities/issue.entity';
import { ExternalData } from '../entities/external-data.entity';
import { GitHubPullRequest, GitHubCommit } from './github-integration.service';

/**
 * Service for linking GitHub PRs and commits to Zenith issues.
 *
 * Parses branch names like "PROJ-123-feature-name" to extract issue keys.
 * Auto-updates issue status when PRs are merged.
 */
@Injectable()
export class GitHubIssueLinkService {
  private readonly logger = new Logger(GitHubIssueLinkService.name);

  constructor(
    @InjectRepository(Issue)
    private issueRepo: Repository<Issue>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Parse issue key from branch name.
   * Supports patterns: PROJ-123-feature, PROJ-123_feature, PROJ-123
   */
  parseIssueKeyFromBranch(branchName: string): string | null {
    // Match patterns like: PROJ-123, PROJ-123-feature, feat/PROJ-123
    const patterns = [
      /^([A-Z]+-\d+)/i, // PROJ-123 at start
      /\/([A-Z]+-\d+)/i, // feat/PROJ-123
      /([A-Z]+-\d+)-/i, // PROJ-123-feature
      /([A-Z]+-\d+)_/i, // PROJ-123_feature
    ];

    for (const pattern of patterns) {
      const match = branchName.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return null;
  }

  /**
   * Parse issue keys from commit message.
   * Supports: "fix PROJ-123", "closes #123", "refs PROJ-123"
   */
  parseIssueKeysFromCommitMessage(message: string): string[] {
    const keys: string[] = [];

    // Match patterns like: PROJ-123, fixes PROJ-123, closes PROJ-123
    const patterns = [
      /\b([A-Z]+-\d+)\b/gi, // PROJ-123
      /(?:fix(?:es)?|close(?:s)?|resolve(?:s)?)\s+#(\d+)/gi, // fixes #123
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(message)) !== null) {
        if (match[1]) {
          keys.push(match[1].toUpperCase());
        }
      }
    }

    return [...new Set(keys)]; // Remove duplicates
  }

  /**
   * Link a PR to an issue based on branch name.
   */
  async linkPRToIssue(
    integrationId: string,
    pr: GitHubPullRequest,
    repository: string,
  ): Promise<{ issueKey: string; linked: boolean } | null> {
    const issueKey = this.parseIssueKeyFromBranch(pr.head.ref);
    if (!issueKey) {
      return null;
    }

    const issue = await this.findIssueByKey(issueKey);
    if (!issue) {
      this.logger.warn(`Issue ${issueKey} not found for PR #${pr.number}`);
      return { issueKey, linked: false };
    }

    // Store the link in external data using proper column names
    await this.externalDataRepo.upsert(
      {
        integrationId,
        externalType: 'pr_issue_link',
        externalId: `${pr.id}-${issueKey}`,
        rawData: {
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: `https://github.com/${repository}/pull/${pr.number}`,
          prState: pr.state,
          issueId: issue.id,
          issueKey,
          projectKey: issue.project.key,
          organizationId: issue.project.organizationId,
          linkedAt: new Date().toISOString(),
        },
      },
      ['integrationId', 'externalType', 'externalId'],
    );

    this.logger.log(`Linked PR #${pr.number} to issue ${issueKey}`);
    return { issueKey, linked: true };
  }

  /**
   * Link a commit to issues mentioned in the message.
   */
  async linkCommitToIssues(
    integrationId: string,
    commit: GitHubCommit,
  ): Promise<string[]> {
    const issueKeys = this.parseIssueKeysFromCommitMessage(
      commit.commit.message,
    );
    const linkedKeys: string[] = [];

    for (const issueKey of issueKeys) {
      const issue = await this.findIssueByKey(issueKey);
      if (!issue) {
        continue;
      }

      await this.externalDataRepo.upsert(
        {
          integrationId,
          externalType: 'commit_issue_link',
          externalId: `${commit.sha}-${issueKey}`,
          rawData: {
            commitSha: commit.sha,
            commitMessage: commit.commit.message.split('\n')[0],
            commitUrl: commit.html_url,
            commitAuthor: commit.commit.author.name,
            issueId: issue.id,
            issueKey,
            linkedAt: new Date().toISOString(),
          },
        },
        ['integrationId', 'externalType', 'externalId'],
      );

      linkedKeys.push(issueKey);
    }

    if (linkedKeys.length > 0) {
      this.logger.log(
        `Linked commit ${commit.sha.substring(0, 7)} to issues: ${linkedKeys.join(', ')}`,
      );
    }

    return linkedKeys;
  }

  /**
   * Update issue status when PR is merged.
   */
  async handlePRMerged(
    integrationId: string,
    pr: GitHubPullRequest,
    repository: string,
  ): Promise<boolean> {
    const issueKey = this.parseIssueKeyFromBranch(pr.head.ref);
    if (!issueKey) {
      return false;
    }

    const issue = await this.findIssueByKey(issueKey);
    if (!issue) {
      return false;
    }

    // Update issue status to DONE on PR merge
    issue.status = IssueStatus.DONE;
    await this.issueRepo.save(issue);

    // Store the merge event
    await this.externalDataRepo.upsert(
      {
        integrationId,
        externalType: 'pr_merged',
        externalId: `merged-${pr.id}`,
        rawData: {
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: `https://github.com/${repository}/pull/${pr.number}`,
          mergedBy: pr.merged_by?.login ?? 'unknown',
          mergedAt: pr.merged_at ?? new Date().toISOString(),
          issueId: issue.id,
          issueKey,
        },
      },
      ['integrationId', 'externalType', 'externalId'],
    );

    this.logger.log(
      `Issue ${issueKey} marked as DONE due to PR #${pr.number} merge`,
    );
    return true;
  }

  /**
   * Get all GitHub links for an issue.
   */
  async getLinksForIssue(issueId: string): Promise<{
    pullRequests: ExternalData[];
    commits: ExternalData[];
  }> {
    const [pullRequests, commits] = await Promise.all([
      this.externalDataRepo.find({
        where: { externalType: 'pr_issue_link' },
      }),
      this.externalDataRepo.find({
        where: { externalType: 'commit_issue_link' },
      }),
    ]);

    // Filter by issueId in rawData
    return {
      pullRequests: pullRequests.filter((pr) => pr.rawData.issueId === issueId),
      commits: commits.filter((c) => c.rawData.issueId === issueId),
    };
  }

  /**
   * Find issue by searching for a title starting with the issue key.
   * Since Zenith doesn't have a dedicated issueKey column, we search by title pattern.
   */
  private async findIssueByKey(issueKey: string): Promise<Issue | null> {
    const lastDashIndex = issueKey.lastIndexOf('-');
    if (lastDashIndex === -1) return null;

    const projectKey = issueKey.substring(0, lastDashIndex);
    const numberStr = issueKey.substring(lastDashIndex + 1);
    const number = parseInt(numberStr, 10);

    if (isNaN(number)) return null;

    return await this.issueRepo.findOne({
      relations: ['project'],
      where: {
        number,
        project: {
          key: projectKey,
        },
      },
    });
  }
}
