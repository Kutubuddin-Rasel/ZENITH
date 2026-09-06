// src/releases/services/release-notes.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { RELEASE_QUERY_TOKEN } from '../constants/releases.tokens';
import type {
  IReleaseNotes,
  IReleaseQuery,
  ReleaseNotesResult,
} from '../interfaces/releases.interfaces';
import type { Issue } from '../../issues/entities/issue.entity';

/** Section headers keyed by issue type for generated release-notes markdown. */
const TYPE_HEADINGS: Record<string, string> = {
  Bug: '🐛 Bug Fixes',
  Feature: '✨ New Features',
  Task: '📋 Tasks',
  Story: '📖 Stories',
  Epic: '🎯 Epics',
  Improvement: '💪 Improvements',
  Other: '📦 Other Changes',
};

const MAX_DESCRIPTION = 100;

/**
 * Release-notes generation (RELEASE_NOTES_TOKEN). Pure read+format: pulls the
 * linked issues through the read surface and renders grouped markdown. The
 * *persisting* variant (`generateAndSaveReleaseNotes`) is a mutation and lives
 * on the command service.
 */
@Injectable()
export class ReleaseNotesService implements IReleaseNotes {
  constructor(
    @Inject(RELEASE_QUERY_TOKEN) private readonly query: IReleaseQuery,
  ) {}

  async generateReleaseNotes(
    projectId: string,
    releaseId: string,
    userId: string,
  ): Promise<ReleaseNotesResult> {
    const issues = await this.query.getIssues(projectId, releaseId, userId);

    if (issues.length === 0) {
      return {
        notes: '## Release Notes\n\nNo issues are linked to this release yet.',
        issueCount: 0,
      };
    }

    const grouped: Record<string, Issue[]> = {};
    for (const issue of issues) {
      const type = issue.type || 'Other';
      (grouped[type] ??= []).push(issue);
    }

    let notes = `## Release Notes\n\n`;
    for (const [type, typeIssues] of Object.entries(grouped)) {
      notes += `### ${TYPE_HEADINGS[type] || `📦 ${type}`}\n\n`;
      for (const issue of typeIssues) {
        const assigneeName = issue.assignee?.name || 'Unassigned';
        notes += `- **${issue.title}** (${issue.status}) - ${assigneeName}\n`;
        if (issue.description) {
          const desc =
            issue.description.length > MAX_DESCRIPTION
              ? issue.description.substring(0, MAX_DESCRIPTION) + '...'
              : issue.description;
          notes += `  > ${desc}\n`;
        }
      }
      notes += '\n';
    }

    return { notes, issueCount: issues.length };
  }
}
