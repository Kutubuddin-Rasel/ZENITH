/**
 * Event Factory DI Tokens.
 *
 * Symbol-based injection tokens for the segregated factory contracts in
 * `../interfaces/event-factory.interfaces.ts`. Each domain (issues, sprints,
 * boards, invites) injects only the factory it needs — no domain depends on
 * the union of all four (ISP).
 *
 * USAGE:
 *   constructor(
 *     @Inject(ISSUE_EVENT_FACTORY_TOKEN)
 *     private readonly issueEvents: IIssueEventFactory,
 *   ) {}
 */

export const ISSUE_EVENT_FACTORY_TOKEN: unique symbol = Symbol(
  'ISSUE_EVENT_FACTORY_TOKEN',
);
export const SPRINT_EVENT_FACTORY_TOKEN: unique symbol = Symbol(
  'SPRINT_EVENT_FACTORY_TOKEN',
);
export const BOARD_EVENT_FACTORY_TOKEN: unique symbol = Symbol(
  'BOARD_EVENT_FACTORY_TOKEN',
);
export const INVITE_EVENT_FACTORY_TOKEN: unique symbol = Symbol(
  'INVITE_EVENT_FACTORY_TOKEN',
);
