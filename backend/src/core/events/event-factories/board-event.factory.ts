import { Injectable } from '@nestjs/common';
import type {
  BoardEventPayload,
  IBoardEventFactory,
} from '../../../common/interfaces/event-factory.interfaces';

/**
 * BoardEventFactoryProvider
 *
 * SRP: Builds board / column event payloads. Implements
 * `IBoardEventFactory` (bound to `BOARD_EVENT_FACTORY_TOKEN`).
 */
@Injectable()
export class BoardEventFactoryProvider implements IBoardEventFactory {
  create(data: {
    projectId: string;
    actorId: string;
    action: string;
    boardName: string;
    boardId?: string;
    issueId?: string;
    columnName?: string;
  }): BoardEventPayload {
    return {
      projectId: data.projectId,
      actorId: data.actorId,
      boardId: data.boardId,
      issueId: data.issueId || null,
      action: data.action,
      boardName: data.boardName,
      columnName: data.columnName,
      timestamp: new Date(),
    };
  }
}
