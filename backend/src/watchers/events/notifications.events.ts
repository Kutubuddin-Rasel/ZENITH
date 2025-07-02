// src/watchers/events/notifications.events.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface NotificationPayload {
  userIds: string[]; // recipients
  message: string;
  context: {
    // e.g. projectId or issueId
    projectId?: string;
    issueId?: string;
  };
}

@Injectable()
export class NotificationsEmitter {
  constructor(private emitter: EventEmitter2) {}

  emitNotification(payload: NotificationPayload) {
    this.emitter.emit('notification.created', payload);
  }
}
