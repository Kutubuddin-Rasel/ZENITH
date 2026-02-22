/**
 * WebhookEventType — Exhaustive enum of subscribable webhook events.
 *
 * Derived from actual EventEmitter.emit() calls across the codebase.
 * Used by CreateWebhookDto for input validation (@IsEnum).
 *
 * To add a new event:
 *   1. Add the enum value here
 *   2. Add the corresponding @OnEvent listener in WebhooksService
 *   3. Emit the event from the domain service
 */
export enum WebhookEventType {
  // ── Issue Events (from event.factory.ts IssueEventType + issues.service.ts) ──
  ISSUE_CREATED = 'issue.created',
  ISSUE_UPDATED = 'issue.updated',
  ISSUE_DELETED = 'issue.deleted',
  ISSUE_ARCHIVED = 'issue.archived',
  ISSUE_UNARCHIVED = 'issue.unarchived',
  ISSUE_MOVED = 'issue.moved',

  // ── Sprint Events (from sprints.service.ts emit calls) ──
  SPRINT_CREATED = 'sprint.created',
  SPRINT_UPDATED = 'sprint.updated',
  SPRINT_STARTED = 'sprint.started',
  SPRINT_DELETED = 'sprint.deleted',
  SPRINT_ARCHIVED = 'sprint.archived',
  SPRINT_ISSUE_ADDED = 'sprint.issue_added',
  SPRINT_ISSUE_REMOVED = 'sprint.issue_removed',

  // ── Project Events ──
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',

  // ── System Events ──
  WEBHOOK_TEST = 'webhook.test',
}
