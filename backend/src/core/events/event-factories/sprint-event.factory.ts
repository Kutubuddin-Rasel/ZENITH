import { Injectable } from '@nestjs/common';
import type {
  ISprintEventFactory,
  SprintEventPayload,
} from '../../../common/interfaces/event-factory.interfaces';

/**
 * SprintEventFactoryProvider
 *
 * SRP: Builds sprint lifecycle event payloads. Implements
 * `ISprintEventFactory` (bound to `SPRINT_EVENT_FACTORY_TOKEN`).
 */
@Injectable()
export class SprintEventFactoryProvider implements ISprintEventFactory {
  create(data: {
    projectId: string;
    sprintId: string;
    actorId: string;
    action: string;
    sprintName: string;
    issueId?: string;
  }): SprintEventPayload {
    return {
      projectId: data.projectId,
      sprintId: data.sprintId,
      actorId: data.actorId,
      issueId: data.issueId || null,
      action: data.action,
      sprintName: data.sprintName,
      timestamp: new Date(),
    };
  }
}
