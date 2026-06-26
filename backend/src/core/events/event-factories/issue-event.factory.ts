import { Injectable } from '@nestjs/common';
import type {
  IIssueEventFactory,
  IssueEventPayload,
  IssueEventType,
} from '../../../common/interfaces/event-factory.interfaces';

/**
 * IssueEventFactoryProvider
 *
 * SRP: Builds typed `{ type, payload }` envelopes for issue lifecycle
 * events. Pure function inside an injectable shell — no I/O, no DI deps.
 * Implements `IIssueEventFactory` (bound to `ISSUE_EVENT_FACTORY_TOKEN`).
 */
@Injectable()
export class IssueEventFactoryProvider implements IIssueEventFactory {
  create(
    type: IssueEventType,
    data: {
      projectId: string;
      issueId: string;
      actorId: string;
      changes?: Record<string, { from: unknown; to: unknown }>;
    },
  ): { type: IssueEventType; payload: IssueEventPayload } {
    return {
      type,
      payload: {
        projectId: data.projectId,
        issueId: data.issueId,
        actorId: data.actorId,
        changes: data.changes,
        timestamp: new Date(),
      },
    };
  }
}
