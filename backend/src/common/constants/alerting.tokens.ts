/**
 * Alerting DI Tokens.
 *
 * Symbol-based injection tokens for the alerting contracts in
 * `../interfaces/alerting.interfaces.ts`.
 *
 * `ALERT_CHANNEL_TOKEN` is intended to be registered as a multi-provider so
 * Nest collects every concrete `IAlertChannel` implementation into a single
 * injected array — this is the Strategy Pattern composition point that the
 * Step 3 dispatcher will fan out across.
 *
 * USAGE:
 *   // Channel registration (in AlertingModule):
 *   { provide: ALERT_CHANNEL_TOKEN, useClass: SlackAlertChannel, multi: true }
 *
 *   // Dispatcher consumption:
 *   constructor(
 *     @Inject(ALERT_CHANNEL_TOKEN)
 *     private readonly channels: IAlertChannel[],
 *   ) {}
 */

export const ALERT_CHANNEL_TOKEN: unique symbol = Symbol('ALERT_CHANNEL_TOKEN');
export const FAILURE_TRACKER_TOKEN: unique symbol = Symbol(
  'FAILURE_TRACKER_TOKEN',
);
export const ALERT_DISPATCHER_TOKEN: unique symbol = Symbol(
  'ALERT_DISPATCHER_TOKEN',
);
