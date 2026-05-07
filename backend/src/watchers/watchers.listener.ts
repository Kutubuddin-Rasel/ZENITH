import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WatchersService } from './watchers.service';

interface IssueCreatedPayload {
  projectId: string;
  issueId: string;
  actorId: string;
  mentionedUserIds?: string[];
}

interface IssueUpdatedPayload {
  projectId: string;
  issueId: string;
  actorId: string;
  action: string;
  isStatusChange?: boolean;
  mentionedUserIds?: string[];
}

interface IssueDeletedPayload {
  projectId: string;
  issueId: string;
  actorId: string;
}

interface SprintEventPayload {
  projectId: string;
  issueId?: string;
  action: string;
  actorId: string;
  sprintName?: string;
  isStatusChange?: boolean;
  mentionedUserIds?: string[];
}

interface BoardEventPayload {
  projectId: string;
  issueId?: string;
  action: string;
  actorId: string;
  boardName?: string;
  columnName?: string;
  isStatusChange?: boolean;
  mentionedUserIds?: string[];
}

@Injectable()
export class WatchersListener {
  constructor(private watchersService: WatchersService) {}

  @OnEvent('issue.created')
  handleIssueCreated(payload: IssueCreatedPayload): void {
    void this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId,
      'created an issue',
      payload.actorId,
      { mentionedUserIds: payload.mentionedUserIds },
    );
  }

  @OnEvent('issue.updated')
  handleIssueUpdated(payload: IssueUpdatedPayload): void {
    void this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId,
      payload.action,
      payload.actorId,
      {
        isStatusChange: payload.isStatusChange,
        mentionedUserIds: payload.mentionedUserIds,
      },
    );
  }

  @OnEvent('issue.deleted')
  handleIssueDeleted(payload: IssueDeletedPayload): void {
    void this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId,
      'deleted an issue',
      payload.actorId,
    );
  }

  @OnEvent('sprint.event')
  handleSprintEvent(payload: SprintEventPayload): void {
    void this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId ?? null,
      payload.action + (payload.sprintName ? ` (${payload.sprintName})` : ''),
      payload.actorId,
      {
        isStatusChange: payload.isStatusChange,
        mentionedUserIds: payload.mentionedUserIds,
      },
    );
  }

  @OnEvent('board.event')
  handleBoardEvent(payload: BoardEventPayload): void {
    let actionMsg = payload.action;
    if (payload.boardName) actionMsg += ` (${payload.boardName})`;
    if (payload.columnName) actionMsg += ` [${payload.columnName}]`;
    void this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId ?? null,
      actionMsg,
      payload.actorId,
      {
        isStatusChange: payload.isStatusChange,
        mentionedUserIds: payload.mentionedUserIds,
      },
    );
  }
}
