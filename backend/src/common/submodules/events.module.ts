import { Module } from '@nestjs/common';
import {
  BOARD_EVENT_FACTORY_TOKEN,
  INVITE_EVENT_FACTORY_TOKEN,
  ISSUE_EVENT_FACTORY_TOKEN,
  SPRINT_EVENT_FACTORY_TOKEN,
} from '../constants/events.tokens';
import { BoardEventFactoryProvider } from '../../core/events/event-factories/board-event.factory';
import { InviteEventFactoryProvider } from '../../core/events/event-factories/invite-event.factory';
import { IssueEventFactoryProvider } from '../../core/events/event-factories/issue-event.factory';
import { SprintEventFactoryProvider } from '../../core/events/event-factories/sprint-event.factory';

/**
 * CommonEventsModule
 *
 * SRP: Provides the four segregated, injectable event factories. Each
 * domain (issues, sprints, boards, invites) injects only the factory
 * it needs (ISP). The previous static god-class was deleted in Step 4
 * after all consumers migrated to these tokens.
 */
@Module({
  providers: [
    IssueEventFactoryProvider,
    SprintEventFactoryProvider,
    BoardEventFactoryProvider,
    InviteEventFactoryProvider,
    {
      provide: ISSUE_EVENT_FACTORY_TOKEN,
      useExisting: IssueEventFactoryProvider,
    },
    {
      provide: SPRINT_EVENT_FACTORY_TOKEN,
      useExisting: SprintEventFactoryProvider,
    },
    {
      provide: BOARD_EVENT_FACTORY_TOKEN,
      useExisting: BoardEventFactoryProvider,
    },
    {
      provide: INVITE_EVENT_FACTORY_TOKEN,
      useExisting: InviteEventFactoryProvider,
    },
  ],
  exports: [
    ISSUE_EVENT_FACTORY_TOKEN,
    SPRINT_EVENT_FACTORY_TOKEN,
    BOARD_EVENT_FACTORY_TOKEN,
    INVITE_EVENT_FACTORY_TOKEN,
  ],
})
export class CommonEventsModule {}
