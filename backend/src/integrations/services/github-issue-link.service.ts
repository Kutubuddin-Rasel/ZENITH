import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue, IssueStatus } from '../../issues/entities/issue.entity';
import { ExternalData } from '../entities/external-data.entity';
import { GitHubPullRequest, GitHubCommit } from './github-integration.service';

/**
 * Magic Word action types.
 * CLOSE = Issue should be transitioned to Done
 * REFERENCE = Issue is mentioned but not closed
 */
export type MagicWordAction = 'close' | 'reference';

/**
 * Result of parsing a magic word from commit message.
 */
export interface MagicWordMatch {
  action: MagicWordAction;
  issueKey: string;
  rawMatch: string;
}

/**
 * Service for linking GitHub PRs and commits to Zenith issues.
 *
 * Parses branch names like "PROJ-123-feature-name" to extract issue keys.
 * Auto-updates issue status when PRs are merged.
 * Supports "Magic Words" (Fixes #123, closes PROJ-456) to auto-close issues.
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
  ) { }

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
   * Parse issue keys from commit message (legacy method for backward compatibility).
   * @deprecated Use parseMagicWordsFromCommit for action-aware parsing.
   */
  parseIssueKeysFromCommitMessage(message: string): string[] {
    return this.parseMagicWordsFromCommit(message).map((m) => m.issueKey);
  }

  /**
   * Parse magic words from commit message with action detection.
   *
   * Supports GitHub-style keywords:
   * - Close actions: fix, fixes, fixed, close, closes, closed, resolve, resolves, resolved
   * - Reference only: mentions without action keywords
   *
   * Patterns:
   * - "Fixes #123" → { action: 'close', issueKey: '#123' }
   * - "closes PROJ-456" → { action: 'close', issueKey: 'PROJ-456' }
   * - "see PROJ-789" → { action: 'reference', issueKey: 'PROJ-789' }
   *
   * @param message - Commit message to parse
   * @returns Array of magic word matches with actions
   */
  parseMagicWordsFromCommit(message: string): MagicWordMatch[] {
    const results: MagicWordMatch[] = [];
    const seenKeys = new Set<string>();

    // Pattern 1: Close action with issue key (PROJ-123 format)
    // Matches: fix PROJ-123, fixes PROJ-123, fixed PROJ-123, close PROJ-123, etc.
    const closeKeyPattern =
      /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+([A-Z]+-\d+)\b/gi;
    let match: RegExpExecArray | null;

    while ((match = closeKeyPattern.exec(message)) !== null) {
      const issueKey = match[1].toUpperCase();
      if (!seenKeys.has(issueKey)) {
        seenKeys.add(issueKey);
        results.push({
          action: 'close',
          issueKey,
          rawMatch: match[0],
        });
      }
    }

    // Pattern 2: Close action with issue number (#123 format)
    // Matches: fix #123, fixes #123, close #456, etc.
    // Note: These need project context to resolve to full key
    const closeNumberPattern =
      /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)\b/gi;

    while ((match = closeNumberPattern.exec(message)) !== null) {
      const issueNumber = `#${match[1]}`;
      if (!seenKeys.has(issueNumber)) {
        seenKeys.add(issueNumber);
        results.push({
          action: 'close',
          issueKey: issueNumber, // Will be resolved with project context
          rawMatch: match[0],
        });
      }
    }

    // Pattern 3: Reference only (PROJ-123 mentioned without action keyword)
    // Matches any PROJ-123 not already captured
    const referencePattern = /\b([A-Z]+-\d+)\b/gi;

    while ((match = referencePattern.exec(message)) !== null) {
      const issueKey = match[1].toUpperCase();
      if (!seenKeys.has(issueKey)) {
        seenKeys.add(issueKey);
        results.push({
          action: 'reference',
          issueKey,
          rawMatch: match[0],
        });
      }
    }

    return results;
  }

  /**
   * Handle commit magic words - closes issues when "Fixes #123" etc. is found.
   *
   * SECURITY: projectKey can be null if the repository has no explicit project mapping.
   * In that case, #123 style references are IGNORED - only PROJ-123 style is processed.
   * This prevents attackers from closing issues in unrelated projects.
   *
   * @param integrationId - Integration ID for logging
   * @param commit - The GitHub commit to process
   * @param projectKey - Project key for #123 style references, or null if not mapped
   * @param committerName - Name of the committer for system comments
   * @returns Array of issue keys that were closed
   */
  async handleCommitMagicWords(
    integrationId: string,
    commit: GitHubCommit,
    projectKey: string | null,
    committerName: string,
  ): Promise<string[]> {
    const magicWords = this.parseMagicWordsFromCommit(commit.commit.message);
    const closedKeys: string[] = [];

    for (const magicWord of magicWords) {
      if (magicWord.action !== 'close') {
        // Only process close actions, references are handled by linkCommitToIssues
        continue;
      }

      // Resolve issue key
      let resolvedKey = magicWord.issueKey;
      if (resolvedKey.startsWith('#')) {
        // SECURITY CHECK: #123 style refs require an explicit project mapping
        if (!projectKey) {
          this.logger.warn(
            `SECURITY: Ignoring "${magicWord.rawMatch}" - repository has no project mapping. ` +
            `Only PROJ-123 style references are allowed for unmapped repos.`,
          );
          continue;
        }
        // Convert #123 to PROJ-123 using the mapped project
        const number = resolvedKey.substring(1);
        resolvedKey = `${projectKey}-${number}`;
      }

      const issue = await this.findIssueByKey(resolvedKey);
      if (!issue) {
        this.logger.warn(
          `Magic word found "${magicWord.rawMatch}" but issue ${resolvedKey} not found`,
        );
        continue;
      }

      // Skip if already done
      if (issue.status === IssueStatus.DONE) {
        this.logger.debug(`Issue ${resolvedKey} already done, skipping`);
        continue;
      }

      // Close the issue
      issue.status = IssueStatus.DONE;
      await this.issueRepo.save(issue);

      // Store the magic word action as external data
      await this.externalDataRepo.upsert(
        {
          integrationId,
          externalType: 'magic_word_close',
          externalId: `${commit.sha}-${resolvedKey}`,
          rawData: {
            commitSha: commit.sha,
            commitMessage: commit.commit.message.split('\n')[0],
            commitUrl: commit.html_url,
            committerName,
            issueId: issue.id,
            issueKey: resolvedKey,
            magicWord: magicWord.rawMatch,
            closedAt: new Date().toISOString(),
          },
        },
        ['integrationId', 'externalType', 'externalId'],
      );

      // Emit event for activity feed / comments
      this.eventEmitter.emit('issue.closedByCommit', {
        issueId: issue.id,
        issueKey: resolvedKey,
        commitSha: commit.sha.substring(0, 7),
        commitUrl: commit.html_url,
        committerName,
      });

      closedKeys.push(resolvedKey);
      this.logger.log(
        `Issue ${resolvedKey} closed via magic word "${magicWord.rawMatch}" in commit ${commit.sha.substring(0, 7)}`,
      );
    }

    return closedKeys;
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
