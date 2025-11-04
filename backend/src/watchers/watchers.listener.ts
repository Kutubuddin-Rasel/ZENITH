import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WatchersService } from './watchers.service';

@Injectable()
export class WatchersListener {
  constructor(private watchersService: WatchersService) {}

  @OnEvent('issue.created')
  handleIssueCreated(payload: {
    projectId: string;
    issueId: string;
    actorId: string;
  }) {
    this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId,
      'created an issue',
      payload.actorId,
    );
  }

  @OnEvent('issue.updated')
  handleIssueUpdated(payload: {
    projectId: string;
    issueId: string;
    actorId: string;
    action: string;
  }) {
    this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId,
      payload.action,
      payload.actorId,
    );
  }

  @OnEvent('issue.deleted')
  handleIssueDeleted(payload: {
    projectId: string;
    issueId: string;
    actorId: string;
  }) {
    this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId,
      'deleted an issue',
      payload.actorId,
    );
  }

  @OnEvent('sprint.event')
  handleSprintEvent(payload: {
    projectId: string;
    issueId?: string;
    action: string;
    actorId: string;
    sprintName?: string;
  }) {
    this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId ?? null,
      payload.action + (payload.sprintName ? ` (${payload.sprintName})` : ''),
      payload.actorId,
    );
  }

  @OnEvent('board.event')
  handleBoardEvent(payload: {
    projectId: string;
    issueId?: string;
    action: string;
    actorId: string;
    boardName?: string;
    columnName?: string;
  }) {
    let actionMsg = payload.action;
    if (payload.boardName) actionMsg += ` (${payload.boardName})`;
    if (payload.columnName) actionMsg += ` [${payload.columnName}]`;
    this.watchersService.notifyWatchersOnEvent(
      payload.projectId,
      payload.issueId ?? null,
      actionMsg,
      payload.actorId,
    );
  }
}
